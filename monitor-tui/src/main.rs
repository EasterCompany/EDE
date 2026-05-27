/// Darwin Agent Monitor — Rust TUI
///
/// Reads /tmp/darwin-monitor.jsonl (produced by the monitor pi extension)
/// and displays two views:
///   Tab 1: Activity Log — tool calls, bash commands, file operations
///   Tab 2: Chat History — user prompts, agent thinking, agent responses
///
/// Keybindings:
///   1/2, Tab    — switch tabs
///   j/k, Up/Down — scroll
///   PgUp/PgDn  — page scroll
///   g/G        — top/bottom
///   /          — search
///   n/N        — next/prev search match
///   v/V        — visual mode (line / block)
///   y          — yank (copy to clipboard)
///   q, Esc     — quit

use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers, MouseEventKind};
use crossterm::terminal::{disable_raw_mode, enable_raw_mode};
use crossterm::ExecutableCommand;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, Paragraph, Tabs, Wrap};
use ratatui::{DefaultTerminal, Frame};
use serde::Deserialize;
use std::fs;
use std::io::{self, stdout, Write};
use std::process::Command;

const MONITOR_FILE: &str = "/tmp/darwin-monitor.jsonl";

// ── Data model ─────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
struct MonitorEntry {
    ts: f64,
    #[serde(rename = "type")]
    entry_type: String,
    data: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq)]
enum Tab {
    Activity,
    Chat,
    Overview,
}

#[derive(Debug, Clone, PartialEq)]
enum VisualMode {
    Off,
    Line,  // v — select lines
    Block, // V — select block (all visible)
}

#[derive(Debug, Clone)]
struct App {
    entries: Vec<MonitorEntry>,
    lines: Vec<String>,       // rendered display lines
    chat_lines: Vec<String>,  // chat-only lines
    tab: Tab,
    scroll: usize,
    cursor: usize,            // content cursor
    search_query: String,
    search_matches: Vec<usize>,
    search_idx: usize,
    visual: VisualMode,
    visual_start: usize,
    visual_end: usize,
    last_mtime: Option<std::time::SystemTime>,
    width: u16,
}

impl App {
    fn new() -> Self {
        Self {
            entries: vec![],
            lines: vec![],
            chat_lines: vec![],
            tab: Tab::Overview,
            scroll: 0,
            cursor: 0,
            search_query: String::new(),
            search_matches: vec![],
            search_idx: 0,
            visual: VisualMode::Off,
            visual_start: 0,
            visual_end: 0,
            last_mtime: None,
            width: 80,
        }
    }

    fn load(&mut self) {
        // Check if file changed
        if let Ok(meta) = fs::metadata(MONITOR_FILE) {
            if let Ok(mtime) = meta.modified() {
                if self.last_mtime == Some(mtime) && !self.entries.is_empty() {
                    return;
                }
                self.last_mtime = Some(mtime);
            }
        }

        // Read JSONL
        let content = fs::read_to_string(MONITOR_FILE).unwrap_or_default();
        self.entries.clear();
        for line in content.lines() {
            if let Ok(entry) = serde_json::from_str::<MonitorEntry>(line) {
                self.entries.push(entry);
            }
        }
        self.build_lines();
    }

    fn build_lines(&mut self) {
        self.lines.clear();
        self.chat_lines.clear();

        // ── Activity lines ──────────────────────────────
        self.lines.push(format!("{} Activity Log", "─".repeat(40)));
        self.lines.push(String::new());

        if self.entries.is_empty() {
            self.lines.push("  Waiting for agent activity...".to_string());
            self.lines.push(String::new());
            self.lines.push("  Start a chat with Darwin to see tool calls and results here.".to_string());
            return;
        }

        for entry in &self.entries {
            match entry.entry_type.as_str() {
                "tool_call" => {
                    let tool = entry.data["toolName"].as_str().unwrap_or("?");
                    let summary = entry.data["summary"].as_str().unwrap_or("");
                    let ts = format_ts(entry.ts);
                    self.lines.push(format!("{} [{}] {}", ts, tool, summary));
                }
                "tool_result" => {
                    let tool = entry.data["toolName"].as_str().unwrap_or("?");
                    let is_err = entry.data["isError"].as_bool().unwrap_or(false);
                    let preview = entry.data["preview"].as_str().unwrap_or("");
                    let ts = format_ts(entry.ts);
                    let icon = if is_err { "❌" } else { "✓" };
                    self.lines.push(format!("  {} {} result", icon, tool));
                    if !preview.is_empty() {
                        for l in preview.lines().take(6) {
                            self.lines.push(format!("    │ {}", l));
                        }
                        if preview.lines().count() > 6 {
                            self.lines.push(format!("    │ ... ({} more lines)", preview.lines().count() - 6));
                        }
                    }
                }
                "input" => {
                    let text = entry.data["text"].as_str().unwrap_or("");
                    let ts = format_ts(entry.ts);
                    self.lines.push(format!("{} 💬 User: {}", ts, truncate(text, 120)));
                }
                "turn" => {
                    let ev = entry.data["event"].as_str().unwrap_or("");
                    if ev == "start" {
                        let idx = entry.data["turnIndex"].as_u64().unwrap_or(0);
                        self.lines.push(format!("{} ══ Turn {} ══", "─".repeat(30), idx));
                    }
                }
                "agent" => {
                    let ev = entry.data["event"].as_str().unwrap_or("");
                    self.lines.push(format!("  🟢 Agent {}", ev));
                }
                "model" => {
                    let m = entry.data["model"].as_str().unwrap_or("?");
                    self.lines.push(format!("  🔄 Model → {}", m));
                }
                _ => {}
            }
        }

        // ── Chat lines ──────────────────────────────────
        let mut current_role = String::new();
        let mut buffer = String::new();

        for entry in &self.entries {
            if entry.entry_type != "message" {
                // Flush buffer on non-message entries
                if !buffer.is_empty() {
                    self.chat_lines.push(format!("[{}]", current_role));
                    for l in buffer.lines() {
                        self.chat_lines.push(format!("  {}", l));
                    }
                    self.chat_lines.push(String::new());
                    buffer.clear();
                }
                continue;
            }

            let ev = entry.data["event"].as_str().unwrap_or("");
            let role = entry.data["role"].as_str().unwrap_or("");

            match ev {
                "start" => {
                    // Flush previous buffer
                    if !buffer.is_empty() {
                        self.chat_lines.push(format!("[{}]", current_role));
                        for l in buffer.lines() {
                            self.chat_lines.push(format!("  {}", l));
                        }
                        self.chat_lines.push(String::new());
                        buffer.clear();
                    }
                    current_role = role.to_string();
                }
                "update" => {
                    let text = entry.data["text"].as_str().unwrap_or("");
                    buffer.push_str(text);
                }
                "end" => {
                    let full = entry.data["fullText"].as_str().unwrap_or("");
                    if !buffer.is_empty() || !full.is_empty() {
                        let content = if full.is_empty() { &buffer } else { full };
                        self.chat_lines.push(format!("── {} ──", role_label(&current_role)));
                        for l in wrap_text(content, 100) {
                            self.chat_lines.push(format!("  {}", l));
                        }
                        self.chat_lines.push(String::new());
                    }
                    buffer.clear();
                    current_role.clear();
                }
                _ => {}
            }
        }

        // Flush remaining buffer
        if !buffer.is_empty() {
            self.chat_lines.push(format!("[{}]", current_role));
            for l in buffer.lines() {
                self.chat_lines.push(format!("  {}", l));
            }
            self.chat_lines.clear(); // actually we want this? Let's just add it
        }
    }

    fn visible_lines(&self) -> Vec<&str> {
        match self.tab {
            Tab::Activity | Tab::Overview => self.lines.iter().map(|s| s.as_str()).collect(),
            Tab::Chat => self.chat_lines.iter().map(|s| s.as_str()).collect(),
        }
    }

    fn visible_count(&self) -> usize {
        match self.tab {
            Tab::Activity | Tab::Overview => self.lines.len(),
            Tab::Chat => self.chat_lines.len(),
        }
    }

    fn scroll_up(&mut self, n: usize) {
        self.cursor = self.cursor.saturating_sub(n);
    }

    fn scroll_down(&mut self, n: usize) {
        let max = self.visible_count().saturating_sub(1);
        self.cursor = (self.cursor + n).min(max);
    }

    fn scroll_to(&mut self, pos: usize) {
        self.cursor = pos.min(self.visible_count().saturating_sub(1));
    }

    fn search(&mut self, query: &str) {
        self.search_query = query.to_lowercase();
        {
            let lines: Vec<String> = self.visible_lines().iter().map(|s| s.to_string()).collect();
            self.search_matches.clear();
            self.search_idx = 0;
            for (i, line) in lines.iter().enumerate() {
                if line.to_lowercase().contains(&self.search_query) {
                    self.search_matches.push(i);
                }
            }
            if !self.search_matches.is_empty() {
                self.search_idx = 0;
                self.scroll_to(self.search_matches[0]);
            }
        }
    }

    fn search_next(&mut self) {
        if self.search_matches.is_empty() {
            return;
        }
        self.search_idx = (self.search_idx + 1) % self.search_matches.len();
        self.scroll_to(self.search_matches[self.search_idx]);
    }

    fn search_prev(&mut self) {
        if self.search_matches.is_empty() {
            return;
        }
        self.search_idx = if self.search_idx == 0 {
            self.search_matches.len() - 1
        } else {
            self.search_idx - 1
        };
        self.scroll_to(self.search_matches[self.search_idx]);
    }

    fn start_visual(&mut self, mode: VisualMode) {
        self.visual = mode;
        self.visual_start = self.cursor;
        self.visual_end = self.cursor;
    }

    fn update_visual(&mut self) {
        self.visual_end = self.cursor;
    }

    fn yank_visual(&mut self) {
        let start = self.visual_start.min(self.visual_end);
        let end = self.visual_start.max(self.visual_end);
        let lines = self.visible_lines();
        let selected: Vec<&str> = lines[start..=end.min(lines.len().saturating_sub(1))]
            .iter()
            .copied()
            .collect();
        let text = selected.join("\n");

        // Copy to clipboard via xclip / wl-copy / pbcopy
        let result = Command::new("sh")
            .arg("-c")
            .arg("if command -v wl-copy >/dev/null 2>&1; then wl-copy; elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard; elif command -v pbcopy >/dev/null 2>&1; then pbcopy; fi")
            .stdin(std::process::Stdio::piped())
            .spawn();

        if let Ok(mut child) = result {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            let _ = child.wait();
        }

        self.visual = VisualMode::Off;
    }
}

// ── Helpers ────────────────────────────────────────────────────

fn format_ts(epoch_ms: f64) -> String {
    let secs = (epoch_ms / 1000.0) as i64;
    let tm = unsafe { libc::localtime(&secs) };
    unsafe {
        format!("{:02}:{:02}:{:02}", (*tm).tm_hour, (*tm).tm_min, (*tm).tm_sec)
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

fn role_label(role: &str) -> String {
    match role {
        "user" => "💬 User".to_string(),
        "assistant" => "🤖 Darwin".to_string(),
        "thinking" => "🧠 Thinking".to_string(),
        _ => format!("📋 {}", role),
    }
}

fn wrap_text(text: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    for paragraph in text.split("\n\n") {
        for line in paragraph.lines() {
            if line.is_empty() {
                lines.push(String::new());
                continue;
            }
            let mut current = String::new();
            for word in line.split_whitespace() {
                if current.len() + word.len() + 1 > width && !current.is_empty() {
                    lines.push(current);
                    current = word.to_string();
                } else if current.is_empty() {
                    current = word.to_string();
                } else {
                    current.push(' ');
                    current.push_str(word);
                }
            }
            if !current.is_empty() {
                lines.push(current);
            }
        }
    }
    lines
}

// ── Rendering ──────────────────────────────────────────────────

fn draw(app: &mut App, frame: &mut Frame) {
    let area = frame.area();
    let area_width = area.width as usize;

    // Wrap text based on terminal width
    if app.width != area.width {
        app.width = area.width;
        app.build_lines(); // rebuild chat lines with new width if needed
    }

    let layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),   // tabs
            Constraint::Length(1),   // search / status
            Constraint::Min(0),      // content
        ])
        .split(area);

    // ── Tabs ──────────────────────────────────────────────
    let tab_titles = vec![" Overview ", " Activity ", " Chat "];
    let tab_idx = match app.tab {
        Tab::Overview => 0,
        Tab::Activity => 1,
        Tab::Chat => 2,
    };
    let tabs = Tabs::new(tab_titles)
        .select(tab_idx)
        .style(Style::default().fg(Color::Cyan))
        .highlight_style(Style::default().fg(Color::Black).bg(Color::Cyan).add_modifier(Modifier::BOLD))
        .divider("│");
    frame.render_widget(tabs, layout[0]);

    // ── Search / status bar ───────────────────────────────
    let status = if !app.search_query.is_empty() {
        let total = app.search_matches.len();
        let current = if total > 0 { app.search_idx + 1 } else { 0 };
        format!(
            " /{}  [{}/{}]  (n/N: next/prev, Esc: clear)",
            app.search_query, current, total
        )
    } else {
        let line_count = app.visible_count();
        let cursor = app.cursor;
        format!(
            " line {}/{} | j/k:scroll  /:search  v:visual  y:yank  q:quit",
            cursor.saturating_add(1).min(line_count),
            line_count
        )
    };

    let status_line = if app.visual != VisualMode::Off {
        let start = app.visual_start.min(app.visual_end);
        let end = app.visual_start.max(app.visual_end);
        let mode = if app.visual == VisualMode::Line { "VISUAL LINE" } else { "VISUAL BLOCK" };
        Line::from(vec![
            Span::styled(format!(" {} ", mode), Style::default().bg(Color::Yellow).fg(Color::Black)),
            Span::raw(format!(" lines {}-{} | y:yank  Esc:cancel", start + 1, end + 1)),
        ])
    } else {
        Line::from(status)
    };

    let status_para = Paragraph::new(status_line).style(Style::default().fg(Color::DarkGray));
    frame.render_widget(status_para, layout[1]);

    // ── Content ───────────────────────────────────────────
    let visible_count = app.visible_count();
    let content_area_height = layout[2].height as usize;
    let max_scroll = visible_count.saturating_sub(content_area_height);

    // Ensure cursor is visible
    if app.cursor < app.scroll {
        app.scroll = app.cursor;
    } else if app.cursor >= app.scroll.saturating_add(content_area_height) {
        app.scroll = app.cursor.saturating_sub(content_area_height.saturating_sub(1));
    }
    app.scroll = app.scroll.min(max_scroll);

    let visible: Vec<String> = app.visible_lines().iter().map(|s| s.to_string()).collect();
    let start = app.scroll;
    let end = (start + content_area_height).min(visible.len());

    let mut text_lines: Vec<Line> = Vec::new();
    for i in start..end {
        if i >= visible.len() {
            break;
        }

        let line = &visible[i];
        let mut style = Style::default();

        // Highlight cursor line
        if i == app.cursor && app.visual == VisualMode::Off {
            style = style.bg(Color::DarkGray);
        }

        // Highlight search matches
        if !app.search_query.is_empty() && app.search_matches.contains(&i) {
            style = style.bg(Color::Yellow).fg(Color::Black);
        }

        // Highlight visual selection
        if app.visual != VisualMode::Off {
            let vs = app.visual_start.min(app.visual_end);
            let ve = app.visual_start.max(app.visual_end);
            if i >= vs && i <= ve {
                style = Style::default().bg(Color::Blue).fg(Color::White);
            }
            if i == app.cursor {
                style = Style::default().bg(Color::Cyan).fg(Color::Black);
            }
        }

        // Color-code activity lines
        let line_style = if app.tab == Tab::Activity || app.tab == Tab::Overview {
            if line.contains("[bash]") || line.contains("[read]") || line.contains("[write]") || line.contains("[edit]") {
                Style::default().fg(Color::Green)
            } else if line.contains("💬") {
                Style::default().fg(Color::Cyan)
            } else if line.starts_with("  ✓") {
                Style::default().fg(Color::DarkGray)
            } else if line.starts_with("  ❌") {
                Style::default().fg(Color::Red)
            } else {
                Style::default()
            }
        } else {
            Style::default()
        };

        text_lines.push(Line::styled(
            truncate(&line, area_width.saturating_sub(2) as usize),
            style.patch(line_style),
        ));
    }

    let content = Paragraph::new(Text::from(text_lines))
        .block(Block::default().borders(Borders::NONE))
        .wrap(Wrap { trim: false });
    frame.render_widget(content, layout[2]);
}

// ── Event loop ─────────────────────────────────────────────────

fn run(mut terminal: DefaultTerminal) -> io::Result<()> {
    let mut app = App::new();
    let mut search_mode = false;
    let mut search_buf = String::new();

    app.load();

    loop {
        // Reload file periodically
        app.load();

        terminal.draw(|frame| draw(&mut app, frame))?;

        if let Event::Key(key) = event::read()? {
            if key.kind != KeyEventKind::Press {
                continue;
            }

            // ── Search mode ──────────────────────────────
            if search_mode {
                match key.code {
                    KeyCode::Esc => {
                        search_mode = false;
                        search_buf.clear();
                        app.search_query.clear();
                        app.search_matches.clear();
                    }
                    KeyCode::Enter => {
                        search_mode = false;
                        app.search(&search_buf);
                    }
                    KeyCode::Backspace => {
                        search_buf.pop();
                    }
                    KeyCode::Char(c) => {
                        search_buf.push(c);
                    }
                    _ => {}
                }
                app.search_query = search_buf.clone();
                {
                    let lines: Vec<String> = app.visible_lines().iter().map(|s| s.to_string()).collect();
                    app.search_matches.clear();
                    for (i, line) in lines.iter().enumerate() {
                        if line.to_lowercase().contains(&search_buf.to_lowercase()) {
                            app.search_matches.push(i);
                        }
                    }
                    if let Some(&first) = app.search_matches.first() {
                        app.scroll_to(first);
                    }
                }
                continue;
            }

            // ── Visual mode ───────────────────────────────
            if app.visual != VisualMode::Off {
                match key.code {
                    KeyCode::Esc => {
                        app.visual = VisualMode::Off;
                    }
                    KeyCode::Char('j') | KeyCode::Down => {
                        app.scroll_down(1);
                        app.update_visual();
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        app.scroll_up(1);
                        app.update_visual();
                    }
                    KeyCode::Char('g') => {
                        if key.modifiers.contains(KeyModifiers::SHIFT) {
                            app.scroll_to(app.visible_count().saturating_sub(1));
                        } else {
                            app.scroll_to(0);
                        }
                        app.update_visual();
                    }
                    KeyCode::Char('y') => {
                        app.yank_visual();
                    }
                    _ => {}
                }
                continue;
            }

            // ── Normal mode ───────────────────────────────
            match key.code {
                KeyCode::Char('q') | KeyCode::Esc => return Ok(()),
                KeyCode::Char('1') => {
                    app.tab = Tab::Overview;
                    app.cursor = 0;
                    app.scroll = 0;
                }
                KeyCode::Char('2') => {
                    app.tab = Tab::Activity;
                    app.cursor = 0;
                    app.scroll = 0;
                }
                KeyCode::Char('3') => {
                    app.tab = Tab::Chat;
                    app.cursor = 0;
                    app.scroll = 0;
                }
                KeyCode::Tab => {
                    app.tab = match app.tab {
                        Tab::Overview => Tab::Activity,
                        Tab::Activity => Tab::Chat,
                        Tab::Chat => Tab::Overview,
                    };
                    app.cursor = 0;
                    app.scroll = 0;
                }
                KeyCode::Char('j') | KeyCode::Down => app.scroll_down(1),
                KeyCode::Char('k') | KeyCode::Up => app.scroll_up(1),
                KeyCode::PageDown => app.scroll_down(20),
                KeyCode::PageUp => app.scroll_up(20),
                KeyCode::Char('g') => {
                    if key.modifiers.contains(KeyModifiers::SHIFT) {
                        app.scroll_to(app.visible_count().saturating_sub(1));
                    } else {
                        app.scroll_to(0);
                    }
                }
                KeyCode::Char('/') => {
                    search_mode = true;
                    search_buf.clear();
                }
                KeyCode::Char('n') => app.search_next(),
                KeyCode::Char('N') => app.search_prev(),
                KeyCode::Char('v') => {
                    if key.modifiers.contains(KeyModifiers::SHIFT) {
                        app.start_visual(VisualMode::Block);
                    } else {
                        app.start_visual(VisualMode::Line);
                    }
                }
                KeyCode::Char('y') => {
                    // Yank current line
                    let lines = app.visible_lines();
                    if app.cursor < lines.len() {
                        let text = lines[app.cursor];
                        let result = Command::new("sh")
                            .arg("-c")
                            .arg("if command -v wl-copy >/dev/null 2>&1; then wl-copy; elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard; fi")
                            .stdin(std::process::Stdio::piped())
                            .spawn();
                        if let Ok(mut child) = result {
                            if let Some(mut stdin) = child.stdin.take() {
                                let _ = stdin.write_all(text.as_bytes());
                            }
                            let _ = child.wait();
                        }
                    }
                }
                KeyCode::Home => app.scroll_to(0),
                KeyCode::End => app.scroll_to(app.visible_count().saturating_sub(1)),
                _ => {}
            }

            // Handle mouse scroll
        } else if let Event::Mouse(mouse) = event::read()? {
            match mouse.kind {
                MouseEventKind::ScrollDown => app.scroll_down(3),
                MouseEventKind::ScrollUp => app.scroll_up(3),
                _ => {}
            }
        }
    }
}

fn main() -> io::Result<()> {
    enable_raw_mode()?;
    stdout().execute(crossterm::terminal::EnterAlternateScreen)?;

    let result = {
        let terminal = ratatui::Terminal::new(ratatui::backend::CrosstermBackend::new(stdout()))?;
        run(terminal)
    };

    disable_raw_mode()?;
    stdout().execute(crossterm::terminal::LeaveAlternateScreen)?;

    if let Err(err) = &result {
        eprintln!("Error: {}", err);
    }

    result
}
