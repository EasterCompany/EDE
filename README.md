# 🐣 Easter Company Developer Environment (EDE)

Welcome to **EDE** featuring the **Darwin IDE**, the next-generation development environment from Easter Company. Darwin is a unified ecosystem designed to empower developers with cutting-edge AI assistance, precision layouts, and a distraction-free professional aesthetic.

## 🚀 The Darwin Experience

- **AI-First Design**: Seamless, first-class integration with the **pi** coding agent.
- **Agent Monitor**: A dedicated real-time window for monitoring AI tool calls, complete with full-file diffs and syntax highlighting.
- **40/60 Layout**: Optimized screen real estate with a persistent 40% width left-sidebar for tools and a 60% main window for code.
- **Minimalist Aesthetic**: Pure black status lines, thin borders, and "Default" terminal color support.
- **Smart Persistence**: Project-specific AI session persistence with an automatic 48-hour lifecycle.

## 📦 Installation

Install the complete Darwin suite with a single command:

```bash
./install.sh
```
*Prerequisites: nvim, pi, git, curl, lazygit*

## ⌨️ Essential Hotkeys

### 🤖 AI & Monitoring
| Shortcut | Action |
| --- | --- |
| `<C-\>` | **Toggle Darwin CLI**: Open/Hide the AI Agent sidebar |
| `<leader>qe` | **Focus & Interrupt**: Jump to Darwin and stop the current AI action |
| `<leader>ps` | **Agent Monitor**: Restore the real-time AI tool-call monitor |
| `<leader>fr` | **Monitor: Open Read-Only**: Jump to the file the agent is currently viewing |
| `<leader>fw` | **Monitor: Open for Edit**: Jump to the file the agent is currently editing |

### 🛠️ IDE Navigation & Tools
| Shortcut | Action |
| --- | --- |
| `<C-e>` | **File Explorer**: Toggle the standalone modal explorer (Auto-closes on select) |
| `<leader>sr` | **Search & Replace**: Toggle Grug-Far in the unified 40% left sidebar |
| `<leader>gg` | **Lazygit**: Open the Git interface |
| `<C-/>` | **Terminal**: Toggle the secondary terminal sidebar |

## 🛠️ Architecture

1.  **Darwin Neovim**: Built on LazyVim, stripped of intrusive themes to respect terminal colors, and configured for absolute line numbering.
2.  **Pi Agent Extensions**: 
    - `darwin-branding.ts`: Unified EC identity.
    - `monitor.ts`: Real-time markdown-based tool-call visualization.
3.  **Darwin CLI**: A wrapper script that manages `--continue` sessions and enforces the 48-hour context lifecycle.

## 🤝 Community & Support

Darwin is professional-grade software by **Easter Company**.

- **Website**: [easter.company](https://easter.company)
- **Repo**: [github.com/EasterCompany/EDE](https://github.com/EasterCompany/EDE)

---

*"Speed. Precision. Intelligence."* — **Easter Company**
