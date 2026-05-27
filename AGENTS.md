# Easter Company System Context

## Identity & Environment

You are running on **ec-server**: an Arch Linux / AMD Ryzen / NVIDIA RTX desktop acting as the home server for Easter Company. Hostname: `Easter-Server`.

You are connected to a Tailscale network (`100.100.x.x`):

| Host | IP | Role |
|------|----|------|
| ec-gateway | 100.100.1.0 | EC2 instance, public exit node |
| ec-server | 100.100.1.1 | Home server (you are here) |
| Hannah's devices | 100.100.2.0-255 | Personal devices |
| Owen's devices | 100.100.3.0-255 | Personal devices |
| Quinn's devices | 100.100.4.0-255 | Personal devices |

All internal domains are HTTPS-only. HTTP and WebSocket connections are automatically upgraded to secure protocols within the Tailscale network.

**Access Summary:**
- Full local access to ec-server.
- SSH access to ec-gateway via `ssh ec2-user@ec-gateway`.
- Use SSH for remote commands. Never assume local paths apply to ec-gateway.

**Rule of thumb:** If it faces the internet or manages identity → gateway. If it needs GPUs or local storage → server.

---

## Project Structure (/root)

| Directory | Purpose |
|-----------|---------|
| `.ENV` | Developer environment — `env.sh` loads modular `bsh/` utilities (aliases, colour, git wrappers, safe delete) |
| `ECG` | Easter Company Gateway — Rust + Axum, internet-facing, Tailscale exit node |
| `EID` | Easter Identity — Rust + Axum + SQLx + SQLite, central SSO/JWT provider |
| `EMS` | Easter Model Service — Rust + Axum, AI model orchestration (Darwin Cloud / Gemma) |
| `EMP` | Easter Media Player — media backend + static frontend |
| `ETL` | Easter Task Lifecycle — todo list + task manager, Rust + Axum + Leptos + SQLite |
| `EDE` | Darwin IDE — development environment built on pi coding agent + Neovim |
| `E2E` | End-to-end test suite |

---

## Core Services (Deep Dive)

### EID — Easter Identity (Central SSO Provider)
- **Host:** ec-gateway (production). **Port:** 127.0.0.1:8080.
- **Access:** `https://easter.company/eid` (routes through ECG)
- **Stack:** Rust + Axum + Tokio (backend), Leptos WASM/SSR + Tailwind CSS v3 (frontend).
- **Database:** SQLite (`eid.db`), created on first run with default users.
- **Role:** Issues JWTs consumed by all other services. Every service authenticates against EID.
- **Default users:**
  - `root` / `passWord@1199` (system)
  - `owen` / `passWord@1199` (master)
  - `hannah` / `passWord@1199` (admin)
  - `dexter` / `passWord@1199` (assistant)
  - `darwin` / `passWord@1199` (developer)
  - `quinn` / `passWord@1199` (user)
  - `admin` / `admin123` (master — may not exist on all deployments)
- **Deploy:** `./build_deploy.sh` (SSH to ec-gateway, deploys via git archive)

#### EID Frontend Architecture (Shell/App Pattern)
- **Shell:** Global UI overlay (sidebar, header, user status) that hosts sub-applications in an iframe.
- **URL structure:** `/shell?app={app_id}&view={view_id}`.
- **Navigation:** Sidebar items are expandable — selecting an app reveals its sub-views. Shell ↔ App navigation sync via URL params or `postMessage`.
- **Responsive targets:** Mobile (compact/drawer), Tablet (icon sidebar), Desktop (standard sidebar with nested views), Desktop XL (persistent sub-menus).
- **Hydration (Leptos 0.7/Tachys):**
  - All components MUST render a single stable root element to prevent "failed to cast" panics.
  - Default Title/Meta belong in the static `shell` (HTML wrapper), not the reactive `App` component.
  - Resource-dependent views must use `<Suspense>` and read resources inside the boundary to keep client/server DOM counts in sync.
- **Never run EID on ec-server** — Port 8080 belongs to EMS. Deploy via `build_deploy.sh` (host-guarded).

### ECG — Easter Company Gateway
- **Host:** ec-gateway. **Ports:** 80, 443 — all external TLS, routing, WebSockets.
- **Public:** `https://easter.company`. **Internal:** `https://ecg.char-istrian.ts.net`.
- **Stack:** Rust + Axum + Tokio. Routes external traffic within the Tailscale network.
- **Deploy:** `./build_deploy.sh` (SSH to production host, git pull + install).

### EMS — Easter Model Service
- **Host:** ec-server (local). **Port:** 100.100.1.1:8080.
- **Access:** `https://easter.company/ems` (through ECG). **Internal:** `https://ems.char-istrian.ts.net`.
- **Stack:** Rust + Axum + Tokio. Fetches JWT secrets from EID at startup. Uses redirect-based SSO login.
- **Role:** AI model orchestration — routes Darwin Cloud for Darwin IDE, Gemma 4.x for Dexter.
- **Models:** Gemma 4.x features multimodal support and 'thinking mode' with `<|channel|>thought` delimiters.
- **Deploy:** `./build_deploy.sh` / `./build_install.sh` + `ems.service` (systemd).

### EMP — Easter Media Player
- **Host:** ec-server. **Port:** 100.100.1.1:8082.
- **Stack:** Media backend + static frontend server.
- **Important:** Requires explicit `WorkingDirectory=/root/EMP` in systemd config — serves static files from relative paths.

### ETL — Easter Task Lifecycle
- **Host:** ec-server. **Port:** 0.0.0.0:8081.
- **Stack:** Rust + Axum + Leptos (WASM/SSR) + SQLite.
- **TUI:** `etl-tui` binary integrated into Darwin IDE via `<leader>pt`.
- **API:** `http://localhost:8081/dashboard/etl/api/*`

### EDE — Darwin IDE
- **Host:** ec-server (local). Launched via `darwin` alias → `nvim`.
- Built on pi coding agent (`@earendil-works/pi-coding-agent`) + Neovim + LazyVim.
- Extensions at `~/.pi/agent/extensions/` provide Darwin branding, memory store, ETL integration, context debugging, and provider routing.
- Three backends available: `<C-\>` Easter Company, `<C-;>` OpenGo, `<C-'>` Gemini.

---

## Global Tooling

### .ENV — Developer Shell Environment
- **Location:** `/root/.ENV` — sourced automatically before every bash command via `.bash_profile` → `.bashrc` → `.ENV/env.sh`.
- Provides: `g` (git wrapper), `s`/`sd` (safe delete), `st` (system/host/git overview), `vssh` (SSH helper), colour utilities, aliases.

### E2E — End-to-End Test Suite
- **Location:** `/root/E2E`
- Node.js + Playwright test suite covering all Easter Company services.
- Run after every deployment to verify end-to-end functionality.
- Use alongside `build_deploy.sh` / `build_install.sh` — the pipeline is: build → deploy → E2E tests.

---

## Systemd Service Management

All backend services are managed by `systemd`. Standard defaults cause silent failures.

### "Sleep & Wake" Paradigm (`Restart=always`)
Services on ec-server (like EMS) intentionally shut down after inactivity (~30 min) to free VRAM. They exit with code `0` on graceful shutdown.
- **CRITICAL: MUST use `Restart=always`.** `Restart=on-failure` interprets exit 0 as success and permanently disables the service → `502 Bad Gateway`.

### Network Boot Race Conditions
Services on ec-server fetch secrets from ec-gateway across Tailscale during boot. `network.target` triggers before Tailscale connects.
- **CRITICAL:** Network-dependent services MUST include:
  ```ini
  After=network.target tailscaled.service
  Wants=tailscaled.service
  ```
- Without this → instant boot, gateway unreachable, invalid fallback config → infinite redirect/login loops.

### Working Directories
systemd executes binaries from root `/` by default. Services serving local static files (like EMP) MUST define `WorkingDirectory=/root/EMP`.

---

## TLS Certificate Management

Valid Let's Encrypt ECDSA certificate at:
```
/etc/letsencrypt/live/easter.company/fullchain.pem
/etc/letsencrypt/live/easter.company/privkey.pem
```
ECG expects symlinks: `$ECG_CERTS_DIR/cert.pem` → `fullchain.pem`, `$ECG_CERTS_DIR/key.pem` → `privkey.pem`.
Renewal uses standalone authenticator (port 80) with pre/post hooks to stop/start ECG. Auto-renewal timer runs daily.
- **Do not use self-signed certs** — Chrome rejects with `ERR_CERT_AUTHORITY_INVALID`.

---

## Deployment Pattern

Every project has two scripts at root:
- `build_install.sh` — build + deploy locally
- `build_deploy.sh` — SSH to the project's host and run `build_install.sh` there

**Host Guards:** Every `build_install.sh` checks the local Tailscale IP and refuses to run if the service doesn't belong on this machine:
- EID, ECG → must be on **ec-gateway** (100.100.1.0)
- EMS, EMP, ETL → must be on **ec-server** (100.100.1.1)

Use `build_deploy.sh` for remote testing. Never deploy to the wrong host. The guard will block you, but don't rely on it — think before running.

---

## Behavioral Rules (Non-Negotiable)

### 1. Diagnose Before Treating
Never apply band-aids. If a service returns 502, investigate systemd policies, env vars, and network dependencies — do not just restart it. Validate empirically:
1. Process alive (`systemctl status`)
2. Logs show init success (`journalctl`)
3. Internal response (`curl -v http://100.100...`)
4. Gateway response (`curl -v -k https://easter.company/...`)

### 2. Be Autonomous — Do Not Ask For Permission
Work autonomously. Do not pause for confirmation on file edits, test runs, builds, commits, pushes, or SSH. Only stop for genuine ambiguity.

### 3. Strict Development Pipeline
1. `git add <specific files>` (never `git add .`)
2. `git commit -m "..."` (conventional commits: `fix:`, `feat:`, `refactor:`, `chore:`)
3. `git push`
4. Unit tests
5. `build_deploy.sh` or `build_install.sh`
6. E2E / integration tests
Never skip or reorder steps. Never report a task complete until the pipeline finishes. If you're editing 3-4+ files at once or tempted to `git add .` — stop. One small verified change at a time.

### 4. Atomic Changes
1-2 line changes when modifying logic. One logical change per commit. No bundling.

### 5. Run Commands Individually
No `&&` / `||` / `;` chaining unless single atomic operation. Verify each command's output before the next.

### 6. High-Signal, Low-Noise Communication
Brevity. Technical rationale, action taken, verified result. No filler, preamble, or speculation.

### 7. Total Accountability
Own mistakes immediately. Identify the exact line that caused the regression, explain it, fix it. Zero deflection.

### 8. Proactive Security
Default to the most secure paradigm. Lock public ports to Tailscale without being asked.

### 9. Sync & Deploy Before Ending Turn
Before ending a turn, ensure every repo with uncommitted or unpushed changes is fully synced to `main` (commit + push). Immediately after syncing, deploy changes to the relevant environment — local, development, or production — unless the user explicitly instructs otherwise. Never leave changes sitting uncommitted, unpushed, or undeployed.

---

## Code Quality Standards

### General
- Hard limit: 100-200 lines per file. One feature set per file. DRY.
- No `console.log` in committed code. No commented-out code. Delete dead code completely.
- No error handling for impossible scenarios. Validate at system boundaries only.
- No speculative abstractions or out-of-scope refactors.

### TypeScript (Darwin / Node)
- Strictly forbid `any`. No `!` operator unless provably safe.
- Never disable lint rules — fix the code.

### Rust (EMS, ETL, ECG, EID)
- Idiomatic Rust. `thiserror` for errors, `anyhow` for propagation.
- No `.unwrap()` or `.expect()` in production — propagate errors.
- Thin handlers. Business logic in services/modules.

---

## Project Mandates

### Tailwind CSS v3 Only
- **DO NOT UPGRADE TO TAILWIND v4.** Pin CLI to `v3.4.17` in all build scripts.
- Use `@tailwind base/components/utilities;` — never `@import "tailwindcss"`.

### Resolution
- Supports up to 8K. Use custom breakpoints: `xs`, `3xl` through `7xl`.

---

*Consolidated from GEMINI.md, AGENT_GUIDELINES.md, CORE_FUNDAMENTALS.md, legacy .gemini context, and /AGENTS.md.*
*Verified against live system state on ec-server — 2026-05-26.*
