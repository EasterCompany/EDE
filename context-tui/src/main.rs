/// Darwin System Prompt Inspector
///
/// Reads /tmp/darwin-context.md (the full assembled system prompt written
/// by the context-debug pi extension) and displays it in a focused TUI
/// with two tabs:
///
///   Tab 1: Dashboard — stats, structure overview, token breakdown
///   Tab 2: Viewer — full scrollable system prompt with section jumping
///
/// Keybindings:
///   Tab / Shift+Tab   Switch tabs
///   j/k, ↓/↑          Scroll
///   h/l, ←/→          Jump to prev/next section
///   /                  Search
///   n/N                Next/prev match
///   v / V              Visual / Visual Line mode
///   y                  Yank selection to clipboard
///   r                  Refresh from file
///   q, Esc             Quit

use crossterm::{
    event::{
        self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind,
        KeyModifiers, MouseEventKind,
    },
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState},
    Frame, Terminal,
};
use std::{
    fs,
    io::{self, stdout, Write},
    path::Path,
    process::Command,
};

const CONTEXT_FILE: &str = "/tmp/darwin-context.md";

// ── Tabs ───────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tab {
    Overview,
    Viewer,
}

impl Tab {
    fn next(self) -> Self {
        match self {
            Tab::Overview => Tab::Viewer,
            Tab::Viewer => Tab::Overview,
        }
    }
}

// ── Visual Mode ─────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
enum VisualMode {
    None,
    Char,
    Line,
}

// ── App State ──────────────────────────────────────────────────

struct App {
    file_exists: bool,
    last_mtime: u64,
    raw: String,
    lines: Vec<String>,
    line_kinds: Vec<LineKind>,
    sections: Vec<(usize, String)>,
    total_chars: usize,
    est_tokens: usize,
    tab: Tab,
    scroll: usize,    // visual scroll position (index into wrapped lines)
    cursor: usize,     // absolute content line index
    section_sel: usize,  // selected section on Overview tab
    search_query: String,
    search_hits: Vec<usize>,
    search_idx: usize,
    in_search: bool,
    visual_mode: VisualMode,
    visual_anchor: usize,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LineKind {
    H1, H2, H3, CodeFence, Blockquote, Hr, List, TableSep, TableRow, Normal, Empty,
}

fn classify_line(line: &str) -> LineKind {
    let t = line.trim();
    if t.is_empty() { return LineKind::Empty; }
    if t.starts_with("# ") { return LineKind::H1; }
    if t.starts_with("## ") { return LineKind::H2; }
    if t.starts_with("### ") { return LineKind::H3; }
    if t.starts_with("```") { return LineKind::CodeFence; }
    if t.starts_with(">") { return LineKind::Blockquote; }
    if t.starts_with("---") { return LineKind::Hr; }
    if t.starts_with("- ") || t.starts_with("* ") { return LineKind::List; }
    if t.starts_with("|") && t.contains("---") { return LineKind::TableSep; }
    if t.starts_with("|") { return LineKind::TableRow; }
    LineKind::Normal
}

fn style_for_kind(kind: LineKind) -> Style {
    match kind {
        LineKind::H1 => Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        LineKind::H2 => Style::default().fg(Color::Blue).add_modifier(Modifier::BOLD),
        LineKind::H3 => Style::default().fg(Color::Yellow),
        LineKind::Blockquote => Style::default().fg(Color::DarkGray).italic(),
        LineKind::CodeFence => Style::default().fg(Color::Magenta),
        LineKind::Hr => Style::default().fg(Color::DarkGray),
        LineKind::List => Style::default().fg(Color::Green),
        LineKind::TableSep => Style::default().fg(Color::DarkGray),
        LineKind::TableRow => Style::default().fg(Color::White),
        LineKind::Normal | LineKind::Empty => Style::default(),
    }
}

impl App {
    fn new() -> Self {
        let mut app = App {
            file_exists: false, last_mtime: 0,
            raw: String::new(), lines: Vec::new(), line_kinds: Vec::new(),
            sections: Vec::new(), total_chars: 0, est_tokens: 0,
            tab: Tab::Overview, scroll: 0, cursor: 0, section_sel: 0,
            search_query: String::new(), search_hits: Vec::new(), search_idx: 0, in_search: false,
            visual_mode: VisualMode::None, visual_anchor: 0,
        };
        app.load();
        app
    }

    fn load(&mut self) {
        let path = Path::new(CONTEXT_FILE);
        self.file_exists = path.exists();
        self.last_mtime = path.metadata().ok()
            .and_then(|m| m.modified().ok())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
            .unwrap_or(0);

        self.raw = if self.file_exists {
            fs::read_to_string(path).unwrap_or_default()
        } else {
            "# 🧠 Darwin System Prompt\n\n*No context captured yet — send a prompt.*\n".into()
        };

        self.lines = self.raw.lines().map(|l| l.to_string()).collect();
        self.line_kinds = self.lines.iter().map(|l| classify_line(l)).collect();
        self.total_chars = self.raw.len();
        self.est_tokens = self.total_chars / 4;

        self.sections.clear();
        for (i, kind) in self.line_kinds.iter().enumerate() {
            match kind {
                LineKind::H1 | LineKind::H2 | LineKind::H3 => {
                    self.sections.push((i, self.lines[i].trim().to_string()));
                }
                _ => {}
            }
        }

        self.scroll = 0;
        self.cursor = 0;
        self.search_hits.clear();
        self.search_idx = 0;
    }

    fn check_reload(&mut self) {
        if let Ok(meta) = Path::new(CONTEXT_FILE).metadata() {
            if let Ok(modi) = meta.modified() {
                let mt = modi.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
                if mt > self.last_mtime { self.load(); }
            }
        }
    }

    fn do_search(&mut self) {
        self.search_hits.clear();
        self.search_idx = 0;
        if self.search_query.is_empty() { return; }
        let q = self.search_query.to_lowercase();
        for (i, line) in self.lines.iter().enumerate() {
            if line.to_lowercase().contains(&q) { self.search_hits.push(i); }
        }
        if let Some(&abs) = self.search_hits.first() {
            self.cursor = abs;
        }
    }

    fn jump_next_section(&mut self) {
        let cur = self.cursor;
        for &(start, _) in &self.sections {
            if start > cur {
                self.cursor = start;
                return;
            }
        }
    }

    fn jump_prev_section(&mut self) {
        let cur = self.cursor;
        for &(start, _) in self.sections.iter().rev() {
            if start < cur {
                self.cursor = start;
                return;
            }
        }
    }

    fn selection_range(&self) -> Option<(usize, usize)> {
        if self.visual_mode == VisualMode::None { return None; }
        let a = self.visual_anchor;
        let c = self.cursor;
        Some(if c <= a { (c, a) } else { (a, c) })
    }

    fn is_selected(&self, line: usize) -> bool {
        self.selection_range().map_or(false, |(s, e)| line >= s && line <= e)
    }

    fn yank_selection(&self) {
        let Some((s, e)) = self.selection_range() else { return };
        let mut text = String::new();
        for i in s..=e {
            if i < self.lines.len() {
                text.push_str(&self.lines[i]);
                text.push('\n');
            }
        }
        copy_to_clipboard(&text);
    }
}

// ── Clipboard ──────────────────────────────────────────────────

fn copy_to_clipboard(text: &str) -> bool {
    let cmds = [
        ("xclip", &["-selection", "clipboard"][..]),
        ("wl-copy", &[][..]),
        ("pbcopy", &[][..]),
    ];
    for (cmd, args) in cmds {
        if let Ok(mut child) = Command::new(cmd).args(args).stdin(std::process::Stdio::piped()).spawn() {
            if let Some(mut stdin) = child.stdin.take() { let _ = stdin.write_all(text.as_bytes()); }
            let _ = child.wait();
            return true;
        }
    }
    let _ = fs::write("/tmp/darwin-yank.txt", text);
    false
}

// ── Word Wrap ──────────────────────────────────────────────────

fn wrap_text(text: &str, width: usize) -> Vec<String> {
    if width == 0 { return vec![text.to_string()]; }
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::with_capacity(width);
    for word in text.split_inclusive(|c: char| c == ' ' || c == '\t') {
        let w = word.trim_end_matches(|c: char| c == ' ' || c == '\t');
        if w.is_empty() { continue; }
        if cur.is_empty() {
            if w.len() > width {
                for chunk in w.as_bytes().chunks(width) {
                    let s = String::from_utf8_lossy(chunk).to_string();
                    if !cur.is_empty() { out.push(std::mem::take(&mut cur)); }
                    cur = s;
                }
            } else { cur.push_str(w); }
        } else if cur.len() + 1 + w.len() <= width {
            cur.push(' '); cur.push_str(w);
        } else {
            out.push(std::mem::take(&mut cur));
            if w.len() > width {
                for chunk in w.as_bytes().chunks(width) {
                    let s = String::from_utf8_lossy(chunk).to_string();
                    if !cur.is_empty() { out.push(std::mem::take(&mut cur)); }
                    cur = s;
                }
            } else { cur.push_str(w); }
        }
    }
    if !cur.is_empty() { out.push(cur); }
    if out.is_empty() { out.push(String::new()); }
    out
}

// ── Rendering ──────────────────────────────────────────────────

fn render_tab_bar(frame: &mut Frame, app: &App, area: Rect) {
    let o_style = if app.tab == Tab::Overview {
        Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD)
    } else { Style::default().fg(Color::Gray) };
    let v_style = if app.tab == Tab::Viewer {
        Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD)
    } else { Style::default().fg(Color::Gray) };

    let line = Line::from(vec![
        Span::styled(" Overview ", o_style),
        Span::raw(" │ "),
        Span::styled(" System Prompt ", v_style),
        Span::raw("  (Tab to switch)"),
    ]);
    frame.render_widget(Paragraph::new(Text::from(line)), area);
}

fn render_dashboard(frame: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(6), Constraint::Min(1)])
        .split(area);

    let stats = vec![
        Line::from(Span::styled("🧠 System Prompt Statistics", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))),
        Line::from(""),
        Line::from(format!("  Total characters : {}", app.total_chars)),
        Line::from(format!("  Estimated tokens : ~{}", app.est_tokens)),
        Line::from(format!("  Sections         : {}", app.sections.len())),
    ];
    frame.render_widget(
        Paragraph::new(Text::from(stats)).block(Block::default().borders(Borders::ALL).title(" Stats ")),
        chunks[0],
    );

    let mut nav: Vec<Line> = Vec::new();
    nav.push(Line::from(Span::styled("📑 Sections  (jk:select  Enter:jump to viewer  Tab:switch view)", Style::default().fg(Color::Yellow))));
    for (i, &(_start, ref title)) in app.sections.iter().enumerate() {
        let is_sel = i == app.section_sel;
        let marker = if is_sel { "▶" } else { " " };
        let short = if title.len() > 60 { format!("{}…", &title[..57]) } else { title.clone() };
        let style = if is_sel { Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD) } else { Style::default() };
        nav.push(Line::from(Span::styled(format!("  {} {}", marker, short), style)));
    }
    frame.render_widget(
        Paragraph::new(Text::from(nav)).block(Block::default().borders(Borders::ALL).title(" Sections ")),
        chunks[1],
    );
}

/// Parse inline markdown into styled spans.
/// Handles **bold**, *italic*, and `code`.
fn render_markdown_spans<'a>(text: &'a str, base: Style) -> Vec<Span<'a>> {
    let mut spans: Vec<Span> = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut buf = String::new();

    while i < len {
        // Inline code: `...`
        if chars[i] == '`' {
            // Find closing backtick
            let start = i;
            i += 1;
            while i < len && chars[i] != '`' { i += 1; }
            if i < len && i > start + 1 {
                // Flush buffer
                if !buf.is_empty() {
                    spans.push(Span::styled(std::mem::take(&mut buf), base));
                }
                let code_text: String = chars[start + 1..i].iter().collect();
                spans.push(Span::styled(
                    format!("`{}`", code_text),
                    Style::default().fg(Color::Yellow),
                ));
                i += 1;
                continue;
            } else {
                // Lone backtick — treat as literal
                buf.push('`');
                i = start + 1;
                continue;
            }
        }

        // Bold: **...**
        if i + 1 < len && chars[i] == '*' && chars[i + 1] == '*' {
            let start = i;
            i += 2;
            while i + 1 < len && !(chars[i] == '*' && chars[i + 1] == '*') { i += 1; }
            if i + 1 < len && i > start + 2 {
                if !buf.is_empty() {
                    spans.push(Span::styled(std::mem::take(&mut buf), base));
                }
                let bold_text: String = chars[start + 2..i].iter().collect();
                spans.push(Span::styled(
                    bold_text,
                    base.add_modifier(Modifier::BOLD),
                ));
                i += 2;
                continue;
            } else {
                // Not a valid bold — push `**` as literal and continue
                buf.push_str("**");
                i = start + 2;
                continue;
            }
        }

        // Italic: *...*  (single asterisk, not double)
        if chars[i] == '*' && (i == 0 || chars[i - 1] != '*') && (i + 1 >= len || chars[i + 1] != '*') {
            let start = i;
            i += 1;
            while i < len && chars[i] != '*' { i += 1; }
            if i < len && i > start + 1 {
                if !buf.is_empty() {
                    spans.push(Span::styled(std::mem::take(&mut buf), base));
                }
                let it_text: String = chars[start + 1..i].iter().collect();
                spans.push(Span::styled(
                    it_text,
                    base.add_modifier(Modifier::ITALIC),
                ));
                i += 1;
                continue;
            }
            // Fall through — treat as literal
            i = start;
        }

        buf.push(chars[i]);
        i += 1;
    }

    if !buf.is_empty() {
        spans.push(Span::styled(buf, base));
    }

    if spans.is_empty() {
        spans.push(Span::styled(text, base));
    }

    spans
}

fn render_viewer(frame: &mut Frame, app: &mut App, area: Rect) {
    let width = area.width.saturating_sub(2).max(20) as usize;
    let page_h = area.height.saturating_sub(1) as usize;

    struct VLine { abs: usize, text: String, kind: LineKind, is_first: bool }
    let mut visual: Vec<VLine> = Vec::new();
    for (abs, line) in app.lines.iter().enumerate() {
        let kind = app.line_kinds[abs];
        for (fi, frag) in wrap_text(line, width).iter().enumerate() {
            visual.push(VLine {
                abs, kind: if fi == 0 { kind } else { LineKind::Normal },
                text: if fi == 0 { frag.clone() } else { format!("  {}", frag) },
                is_first: fi == 0,
            });
        }
    }

    let total = visual.len();
    let cursor_v = visual.iter().position(|v| v.abs == app.cursor).unwrap_or(0);
    // Auto-scroll to keep cursor visible
    let mut scroll = app.scroll.min(total.saturating_sub(1));
    if cursor_v < scroll {
        scroll = cursor_v;
    } else if cursor_v >= scroll + page_h {
        scroll = cursor_v.saturating_sub(page_h.saturating_sub(1));
    }
    app.scroll = scroll; // write back for next frame
    let end = (scroll + page_h).min(total);

    let mut text_lines: Vec<Line> = Vec::new();
    for vi in scroll..end {
        let vl = &visual[vi];
        let is_cursor = vi == cursor_v;
        let in_sel = app.is_selected(vl.abs);

        if is_cursor {
            // Selected line: raw source text, no markdown parsing
            let style = Style::default().bg(Color::Rgb(40, 40, 50));
            text_lines.push(Line::styled(&vl.text, style));
        } else {
            // Render markdown inline
            let base = style_for_kind(vl.kind);
            let style = if in_sel { base.bg(Color::Rgb(50, 50, 40)) } else { base };
            let spans = render_markdown_spans(&vl.text, style);
            text_lines.push(Line::from(spans));
        }
    }

    frame.render_widget(
        Paragraph::new(Text::from(text_lines)).block(Block::default().borders(Borders::NONE)),
        area,
    );

    if total > page_h {
        let mut sb = ScrollbarState::new(total).position(scroll);
        frame.render_stateful_widget(
            Scrollbar::new(ScrollbarOrientation::VerticalRight).begin_symbol(None).end_symbol(None),
            area, &mut sb,
        );
    }
}

fn render_ui(frame: &mut Frame, app: &mut App) {
    let area = frame.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(2), Constraint::Min(1), Constraint::Length(1)])
        .split(area);

    // Tab bar
    render_tab_bar(frame, app, chunks[0]);

    // Content
    match app.tab {
        Tab::Overview => render_dashboard(frame, app, chunks[1]),
        Tab::Viewer => render_viewer(frame, app, chunks[1]),
    }

    // Status bar
    let status = if app.in_search {
        format!(" 🔍 /{}  [{} of {}]", app.search_query,
            if app.search_hits.is_empty() { 0 } else { app.search_idx + 1 }, app.search_hits.len())
    } else if app.visual_mode != VisualMode::None {
        format!(" {}  │  {} lines selected  │  y:yank  Esc:cancel",
            if app.visual_mode == VisualMode::Line { "VISUAL LINE" } else { "VISUAL" },
            app.selection_range().map_or(0, |(s, e)| e - s + 1))
    } else {
        format!(" Ln {}/{}  │  Tab:switch view  jk:scroll  hl:jump section  /:search  v:visual  r:refresh  q:quit",
            app.cursor + 1, app.lines.len())
    };
    frame.render_widget(
        Paragraph::new(status).style(Style::default().fg(Color::Black).bg(Color::DarkGray)),
        chunks[2],
    );
}

// ── Main ───────────────────────────────────────────────────────

fn main() -> io::Result<()> {
    enable_raw_mode()?;
    let mut stdout = stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;

    let mut app = App::new();
    let result = run(&mut app);

    disable_raw_mode()?;
    execute!(stdout, LeaveAlternateScreen, DisableMouseCapture)?;
    result
}

fn run(app: &mut App) -> io::Result<()> {
    let backend = CrosstermBackend::new(stdout());
    let mut terminal = Terminal::new(backend)?;

    loop {
        app.check_reload();
        terminal.draw(|frame| render_ui(frame, app))?;

        if !event::poll(std::time::Duration::from_millis(100))? { continue; }

        match event::read()? {
            Event::Key(key) => {
                if key.kind != KeyEventKind::Press && key.kind != KeyEventKind::Repeat { continue; }

                // Search mode
                if app.in_search {
                    match key.code {
                        KeyCode::Esc => app.in_search = false,
                        KeyCode::Enter => app.in_search = false,
                        KeyCode::Char(c) => { app.search_query.push(c); app.do_search(); }
                        KeyCode::Backspace => { app.search_query.pop(); app.do_search(); }
                        _ => {}
                    }
                    continue;
                }

                let max = app.lines.len().saturating_sub(1);

                match key.code {
                    KeyCode::Esc => {
                        if app.visual_mode != VisualMode::None { app.visual_mode = VisualMode::None; }
                        else { return Ok(()); }
                    }
                    KeyCode::Char('q') if app.visual_mode == VisualMode::None && !app.in_search => return Ok(()),
                    KeyCode::Tab => {
                        app.tab = app.tab.next();
                        app.cursor = 0; app.scroll = 0;
                    }

                    // Movement
                    KeyCode::Char('j') | KeyCode::Down => {
                        if app.tab == Tab::Overview {
                            app.section_sel = (app.section_sel + 1).min(app.sections.len().saturating_sub(1));
                        } else {
                            app.cursor = (app.cursor + 1).min(max);
                        }
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        if app.tab == Tab::Overview {
                            app.section_sel = app.section_sel.saturating_sub(1);
                        } else {
                            app.cursor = app.cursor.saturating_sub(1);
                        }
                    }
                    KeyCode::Enter if app.tab == Tab::Overview => {
                        if let Some(&(start, _)) = app.sections.get(app.section_sel) {
                            app.tab = Tab::Viewer;
                            app.cursor = start;
                        }
                    }
                    KeyCode::PageDown => {
                        let h = terminal.get_frame().area().height.saturating_sub(3) as usize;
                        app.cursor = (app.cursor + h).min(max);
                    }
                    KeyCode::PageUp => {
                        let h = terminal.get_frame().area().height.saturating_sub(3) as usize;
                        app.cursor = app.cursor.saturating_sub(h);
                    }
                    KeyCode::Home => { app.cursor = 0; }
                    KeyCode::End => { app.cursor = max; }

                    // Section jumping (simple: use the sections index directly)
                    KeyCode::Char('l') | KeyCode::Right => app.jump_next_section(),
                    KeyCode::Char('h') | KeyCode::Left => app.jump_prev_section(),

                    // Search
                    KeyCode::Char('/') => { app.in_search = true; app.search_query.clear(); }

                    // Navigate search hits
                    KeyCode::Char('n') => {
                        if !app.search_hits.is_empty() {
                            app.search_idx = (app.search_idx + 1) % app.search_hits.len();
                            app.cursor = app.search_hits[app.search_idx];
                        }
                    }
                    KeyCode::Char('N') => {
                        if !app.search_hits.is_empty() {
                            if app.search_idx == 0 { app.search_idx = app.search_hits.len() - 1; }
                            else { app.search_idx -= 1; }
                            app.cursor = app.search_hits[app.search_idx];
                        }
                    }

                    // Visual mode
                    KeyCode::Char('v') => {
                        app.visual_mode = VisualMode::Char;
                        app.visual_anchor = app.cursor;
                    }
                    KeyCode::Char('V') => {
                        app.visual_mode = VisualMode::Line;
                        app.visual_anchor = app.cursor;
                    }
                    KeyCode::Char('y') => {
                        if app.visual_mode != VisualMode::None {
                            app.yank_selection();
                            app.visual_mode = VisualMode::None;
                        }
                    }

                    KeyCode::Char('r') => app.load(),
                    _ => {}
                }
            }
            Event::Mouse(mouse) => {
                match mouse.kind {
                    MouseEventKind::ScrollDown => {
                        app.cursor = (app.cursor + 3).min(app.lines.len().saturating_sub(1));
                    }
                    MouseEventKind::ScrollUp => {
                        app.cursor = app.cursor.saturating_sub(3);
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }
}
