# EDE: The Easter Company IDE

The **Easter** Company **Development Environment (EDE)**: Which includes *Darwin AI*, and *Darwin CLI* are professional-grade software products maintained by **Easter Company** packaged as one easily installable terminal based interface.

We've been building TUIs since before the AI Agentic Coding Era, and personally we have a thing or two to say about what you've all been doing with them. **TLDR; WE ARE NOT IMPRESSED**.

So we're open sourcing our entire development environment which has stood the test of time since 2016 with pre LLM AI integrations, in hopes that software engineering can get back on the right track.

## 🚀 The Darwin Experience

- **AI-Native Workflow**: Deep, first-class integration with the **Darwin** coding agent.
- **Smart Context**: Chat instances are repo specific and the context window automatically manages memory TTL, Compaction, and Persistence.
- **40/60 Layout**: Optimized screen real estate with a persistent: 40% for context and 60% for task rule.
- **Cinematic Aesthetic**: Local terminal theme support for visual integration into your existing environment, rather than independently configured themes.
- **Agent Monitor**: A dedicated real-time window for monitoring AI tool calls, featuring full-file diffs and syntax-aware previews.

## 📦 Installation (Apple/Linux or Windows via WSL)

Download and Install the complete EDE (Darwin IDE and CLI) suite with a single command:

### Download and Install (Apple/Linux/WSL)
Install Darwin without cloning the repository first.
```bash
curl -sL https://easter.company/ede/install | bash
```

*Prerequisites: nvim, pi, git, curl, lazygit, mpv (The installer will attempt to auto-install any missing dependencies)*

### Clone Source and Install (Linux/WSL)

Recommended for users who want to customize EDE.

```bash
git clone git@github.com:EasterCompany/EDE.git && cd EDE && ./install.sh
```

### Unattended Silent Install (Linux/WSL)

Ideal for quick setup or automated scripts.

```bash
git clone git@github.com:EasterCompany/EDE.git && cd EDE && ./install.sh -y -s
```

## ⌨️ Essential Hotkeys

| Shortcut | Action |
| --- | --- |
| `[CTRL] + \` | **Toggle Darwin CLI**: Open/Hide the AI Agent sidebar |
| `[SPACE] + QE` | **Focus & Interrupt**: Instantly jump to Darwin and stop the current AI action |
| `[SPACE] + PS` | **Agent Monitor**: Restore the real-time AI tool-call monitor |
| `[SPACE] + FR` | **Monitor Jump (Read)**: Jump to the file the agent is currently viewing |
| `[SPACE] + FW` | **Monitor Jump (Edit)**: Jump to the file the agent is currently editing |
| `[CTRL] + E` | **File Explorer**: Toggle the standalone modal explorer (Auto-closes on select) |
| `[SPACE] + SR` | **Search & Replace**: Toggle Grug-Far in the unified 40% left sidebar |
| `[SPACE] + GG` | **Lazygit**: Open the Git interface |
| `[CTRL] + /` | **Terminal**: Toggle the secondary terminal sidebar |

## 🏗️ System Architecture

1.  **Darwin IDE based on Vim**:
  An extremely high-performance & light-weight text editor.
  - **Extensions**:
    1. ...
    2. ...

2.  **Darwin CLI based on Pi Coding Agent**:
  For accessibility and extensions support.
  - **Extensions**:
    1. `darwin-branding.ts`: Enables a unified theme across all interfaces.
    2. `monitor.ts`: Generates a markdown-based visualization of the agent's internal state.

## 🤝 Community & Support

We welcome and encourage anyone and everyone to get involved with our open source efforts. Don't be shy, open an issue, create a pull request, fork it, hack it, delete it, [buy it, use it, break it, fix it, trash it, change it, mail, upgrade it
Charge it, point it, zoom it, press it, snap it, work it, quick erase it
Write it, cut it, paste it, save it, load it, check it, quick rewrite it
Plug it, play it, burn it, rip it, drag it, drop it, zip - unzip it
Lock it, fill it, call it, find it, view it, code it, jam, unlock it
Surf it, scroll it, pause it, click it, cross it, crack it, switch, update it
Name it, read it, tune it, print it, scan it, send it, fax, rename it
Touch it, bring it, pay it, watch it, turn it, leave it, stop, format it
Buy it, use it, break it, fix it, trash it, change it, mail, upgrade it
Charge it, point it, zoom it, press it, snap it, work it, quick erase it
Write it, cut it, paste it, save it, load it, check it, quick rewrite it
Plug it, play it, burn it, rip it, drag it, drop it, zip - unzip it
Touch it, bring it, pay it, watch it, turn it, leave it, stop, format it
](https://www.youtube.com/watch?v=D8K90hX4PrE&list=RDD8K90hX4PrE&start_radio=1).

- **Official Website**: [easter.company](https://easter.company)
- **Source Repository**: [github.com/EasterCompany/EDE](https://github.com/EasterCompany/EDE)

---

*"Engineering Education, Entertainment, and Enterprise."* — **Easter Company**
