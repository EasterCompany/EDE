# 🐣 Easter Company Developer Environment (EDE)

Welcome to **EDE** featuring the **Darwin IDE**, the next-generation development environment from Easter Company. Darwin is a unified, AI-first ecosystem designed to empower developers with professional-grade layouts, real-time monitoring, and a distraction-free aesthetic.

## 🚀 The Darwin Experience

- **AI-Native Workflow**: Deep, first-class integration with the **pi** coding agent (Gemini 3 Flash optimized).
- **Agent Monitor**: A dedicated real-time window for monitoring AI tool calls, featuring full-file diffs and syntax-aware previews.
- **Precision 40/60 Layout**: Optimized screen real estate with a persistent 40% width sidebar for tools and a 60% main window for development.
- **Cinematic Aesthetic**: Pure black status lines, thin borders, and "Default" terminal color support for maximum clarity.
- **Smart Context**: Project-specific AI session persistence with an automatic 48-hour lifecycle to keep your focus fresh.

## 📦 Installation

Experience the complete Darwin suite with a single command:

```bash
./install.sh -y
```
*Prerequisites: nvim, pi, git, curl, lazygit*

## ⌨️ Essential Hotkeys

### 🤖 AI & Monitoring
| Shortcut | Action |
| --- | --- |
| `[CTRL] + \` | **Toggle Darwin CLI**: Open/Hide the AI Agent sidebar |
| `[SPACE] + QE` | **Focus & Interrupt**: Instantly jump to Darwin and stop the current AI action |
| `[SPACE] + PS` | **Agent Monitor**: Restore the real-time AI tool-call monitor |
| `[SPACE] + FR` | **Monitor Jump (Read)**: Jump to the file the agent is currently viewing |
| `[SPACE] + FW` | **Monitor Jump (Edit)**: Jump to the file the agent is currently editing |

### 🛠️ IDE Navigation & Tools
| Shortcut | Action |
| --- | --- |
| `[CTRL] + E` | **File Explorer**: Toggle the standalone modal explorer (Auto-closes on select) |
| `[SPACE] + SR` | **Search & Replace**: Toggle Grug-Far in the unified 40% left sidebar |
| `[SPACE] + GG` | **Lazygit**: Open the Git interface |
| `[CTRL] + /` | **Terminal**: Toggle the secondary terminal sidebar |

## 🏗️ System Architecture

1.  **Darwin Neovim**: A high-performance config built on LazyVim. It uses absolute line numbering and is stripped of intrusive themes to respect your terminal's natural palette.
2.  **Darwin CLI Wrapper**: Orchestrates the `darwin` command, handles project-specific session lookups, and enforces the 48-hour session expiration.
3.  **Agent Extensions**: 
    - `darwin-branding.ts`: Ensures a unified Easter Company identity across all interactions.
    - `monitor.ts`: Generates the real-time markdown-based visualization of the agent's internal state.

## 🤝 Community & Support

Darwin is professional-grade software maintained by **Easter Company**.

- **Official Website**: [easter.company](https://easter.company)
- **Source Repository**: [github.com/EasterCompany/EDE](https://github.com/EasterCompany/EDE)

---

*"Speed. Precision. Intelligence."* — **Easter Company**
