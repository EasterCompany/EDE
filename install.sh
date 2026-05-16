#!/bin/bash

# Darwin IDE: Animated Unified Installer
# (C) 2026 Easter Company

set -e

# ANSI Colors & Animations
CLEAR="\033[2J\033[H"
BOLD="\033[1m"
RED="\033[31m"
GREEN="\033[32m"
BLUE="\033[34m"
CYAN="\033[36m"
ORANGE="\033[38;5;208m"
GREY="\033[38;5;240m"
RESET="\033[0m"
FLICKER="\033[5m"

# Rainbow Colored Branding
R1="\033[38;5;196m" # Red
R2="\033[38;5;208m" # Orange
R3="\033[38;5;226m" # Yellow
R4="\033[38;5;46m"  # Green
R5="\033[38;5;21m"  # Blue
R6="\033[38;5;93m"  # Purple
ORANGE_B="\033[38;5;208;1m"
NAVY_S="\033[38;5;17m"

# Standardized 9-line Frames
# Frame 1: Matrix Backdrop
FRAME1="${GREY}███             ███             ███             ███
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
███░            ███░            ███░            ███░
░░░             ░░░             ░░░             ░░░${RESET}"

# Frame 2: EASTER CO (Orange & Black) - 12 Lines
FRAME2="
 
${ORANGE_B}░░░░░░░        ░░░      ░░░░      ░░░        ░░        ░░       ░░░░░░░░
▒▒▒▒▒▒▒  ▒▒▒▒▒▒▒▒  ▒▒▒▒  ▒▒  ▒▒▒▒▒▒▒▒▒▒▒  ▒▒▒▒▒  ▒▒▒▒▒▒▒▒  ▒▒▒▒  ▒▒▒▒▒▒▒
▓▓▓▓▓▓▓      ▓▓▓▓  ▓▓▓▓  ▓▓▓      ▓▓▓▓▓▓  ▓▓▓▓▓      ▓▓▓▓       ▓▓▓▓▓▓▓▓
███████  ████████        ████████  █████  █████  ████████  ███  ████████
███████        ██  ████  ███      ██████  █████        ██  ████  ███████
 
░░      ░░░░      ░░░  ░░░░  ░░       ░░░░      ░░░   ░░░  ░░  ░░░░  ░  
▒  ▒▒▒▒  ▒▒  ▒▒▒▒  ▒▒   ▒▒   ▒▒  ▒▒▒▒  ▒▒  ▒▒▒▒  ▒▒    ▒▒  ▒▒▒  ▒▒  ▒▒  
▓  ▓▓▓▓▓▓▓▓  ▓▓▓▓  ▓▓        ▓▓       ▓▓▓  ▓▓▓▓  ▓▓  ▓  ▓  ▓▓▓▓    ▓▓▓  
█  ████  ██  ████  ██  █  █  ██  ████████        ██  ██    █████  ████  
██      ████      ███  ████  ██  ████████  ████  ██  ███   █████  ████${RESET}
 
"

# Frame P: PRESENTS (White & Black) - 12 Lines
FRAMEP="
 
${WHITE_B}░       ░░░       ░░░        ░░░      ░░░        ░░   ░░░  ░░        ░░░      ░░  
▒  ▒▒▒▒  ▒▒  ▒▒▒▒  ▒▒  ▒▒▒▒▒▒▒▒  ▒▒▒▒▒▒▒▒  ▒▒▒▒▒▒▒▒    ▒▒  ▒▒▒▒▒  ▒▒▒▒▒  ▒▒▒▒▒▒▒  
▓       ▓▓▓       ▓▓▓      ▓▓▓▓▓      ▓▓▓      ▓▓▓▓  ▓  ▓  ▓▓▓▓▓  ▓▓▓▓▓▓      ▓▓  
█  ████████  ███  ███  ██████████████  ██  ████████  ██    █████  ███████████  █  
█  ████████  ████  ██        ███      ███        ██  ███   █████  ██████      ██  
 
░░░░░░░░░░░░░░░░░░░  ░░░░  ░░  ░░░░  ░░  ░░░░  ░░  ░░░░  ░░░░░░░░░░░░░░░░░░░░░░░░░
▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒   ▒▒   ▒▒  ▒▒▒  ▒▒▒▒  ▒▒  ▒▒▒  ▒▒▒▒  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓        ▓▓     ▓▓▓▓▓▓▓    ▓▓▓▓▓  ▓▓  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
███████████████████  █  █  ██  ███  ████  ██  █████    ███████████████████████████
███████████████████  ████  ██  ████  ██  ████  █████  ████████████████████████████${RESET}
 
"

# Frame 3: DARWIN IDE (Orange & Black) - 12 Lines
FRAME3="
 
${ORANGE_B}░       ░░░░      ░░░       ░░░  ░░░░  ░░        ░░   ░░░  ░
▒  ▒▒▒▒  ▒▒  ▒▒▒▒  ▒▒  ▒▒▒▒  ▒▒  ▒  ▒  ▒▒▒▒▒  ▒▒▒▒▒    ▒▒  ▒
▓  ▓▓▓▓  ▓▓  ▓▓▓▓  ▓▓       ▓▓▓        ▓▓▓▓▓  ▓▓▓▓▓  ▓  ▓  ▓
█  ████  ██        ██  ███  ███   ██   █████  █████  ██    █
█       ███  ████  ██  ████  ██  ████  ██        ██  ███   █
 
░░░░░░░░░░░░░        ░░       ░░░        ░░░░░░░░░░░░░░░░░░░
▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ▒▒▒▒▒  ▒▒▒▒  ▒▒  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓  ▓▓▓▓  ▓▓      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
████████████████  █████  ████  ██  █████████████████████████
█████████████        ██       ███        ███████████████████${RESET}
 
"

# BACKUP IDENTIFIER
BACKUP_PREFIX="nvim.darwin.backup"

# Detect remote (curl|bash) vs local run.
# When piped from curl, $0 is "bash" — it never contains the script filename.
if [[ "$0" == *"install.sh"* ]]; then
  REMOTE_INSTALL=false
else
  REMOTE_INSTALL=true
fi

# Parse Flags
AUTO_CONFIRM=false
SILENT_MODE=false
while getopts "ys" opt; do
  case $opt in
  y) AUTO_CONFIRM=true ;;
  s) SILENT_MODE=true ;;
  *)
    echo "Usage: $0 [-y] [-s]" >&2
    exit 1
    ;;
  esac
done

if [ "$SILENT_MODE" = true ]; then
  exec >/dev/null 2>&1
fi

function draw_centered() {
  local input="$1"
  # If no argument, read from stdin
  if [ -z "$input" ]; then
    input=$(cat)
  fi
  local term_width=$(tput cols 2>/dev/null || echo 80)

  echo -e "$input" | while IFS= read -r line; do
    # Trim leading/trailing whitespace for clean centering
    local trimmed=$(echo -e "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    # Strip ANSI to calculate actual visible length
    local plain=$(echo -e "$trimmed" | sed "s/\x1B\[\([0-9]\{1,3\}\(;[0-9]\{1,3\}\)*\)\?[mGK]//g")
    local length=${#plain}
    [ $length -eq 0 ] && echo "" && continue
    local padding=$(((term_width - length) / 2))
    [ $padding -lt 0 ] && padding=0
    printf "%${padding}s" ""
    echo -e "$trimmed"
  done
}

function flicker() {
  for i in {1..3}; do
    echo -ne "$CLEAR"
    draw_centered "\n\n\n$FRAME1"
    sleep 0.08
    echo -ne "$CLEAR"
    sleep 0.04
  done
}

function animate_intro() {
  echo -ne "$CLEAR"

  # Intro Flicker
  flicker

  # 1. Easter Co
  echo -ne "$CLEAR"
  draw_centered "\n\n\n$FRAME2"
  sleep 0.2
  sleep 1.0

  # Flicker
  flicker

  # 2. Presents
  echo -ne "$CLEAR"
  draw_centered "\n\n\n$FRAMEP"
  sleep 0.2
  sleep 1.0

  # Flicker
  flicker

  # 3. Final: Darwin IDE
  echo -ne "$CLEAR"
  draw_centered "\n\n\n$FRAME3"
  sleep 0.2
  echo -e "\n\n"
}

# START
# Pre-flight for audio (handle before anything else)
MUSIC_FILE="$(dirname "$0")/installer_bgm.mp3"

# Look for the correct filename 'installer_bgm.mp3' (not 'install_bgm.mp3')
if [ ! -f "$MUSIC_FILE" ] && [ ! -f "/tmp/installer_bgm.mp3" ]; then
  curl -sLo /tmp/installer_bgm.mp3 https://easter.company/ede/bgm || curl -sLo /tmp/installer_bgm.mp3 https://raw.githubusercontent.com/EasterCompany/EDE/main/installer_bgm.mp3 || true
fi

if [ ! -f "$MUSIC_FILE" ] && [ -f "/tmp/installer_bgm.mp3" ]; then
  MUSIC_FILE="/tmp/installer_bgm.mp3"
fi

if [ -f "$MUSIC_FILE" ]; then
  # Use ffplay with absolute path to ensure it finds the file
  ABS_MUSIC_FILE=$(realpath "$MUSIC_FILE")
  # Forcing sndio as per previous successful logs
  SDL_AUDIODRIVER=sndio ffplay -nodisp -volume 100 "$ABS_MUSIC_FILE" >/dev/null 2>&1 &
  FFPLAY_PID=$!
  trap "kill $FFPLAY_PID 2>/dev/null; rm -f /tmp/installer_bgm.mp3" EXIT
fi

animate_intro

draw_centered "${BOLD}${CYAN}Starting Darwin IDE installation...${RESET}"

function install_dependency() {
  local cmd="$1"
  draw_centered "${ORANGE}⚠️ $cmd is missing. Attempting to install...${RESET}"

  local pkg="$cmd"
  if [ "$cmd" = "nvim" ]; then pkg="neovim"; fi
  if [ "$cmd" = "ffplay" ]; then pkg="ffmpeg"; fi
  if [ "$cmd" = "rg" ]; then pkg="ripgrep"; fi

  local SUDO_CMD=""
  if command -v sudo &>/dev/null && [ "$EUID" -ne 0 ]; then
    SUDO_CMD="sudo"
  fi

  if [ "$cmd" = "pi" ]; then
    if command -v npm &>/dev/null; then
      $SUDO_CMD npm install -g @mariozechner/pi-coding-agent
    else
      draw_centered "${RED}❌ Error: 'pi' is missing and 'npm' is not found. Please install manually.${RESET}"
      exit 1
    fi
    return
  fi

  local PM=""
  if command -v apt-get &>/dev/null; then
    PM="apt-get"
  elif command -v brew &>/dev/null; then
    PM="brew"
  elif command -v pacman &>/dev/null; then
    PM="pacman"
  elif command -v dnf &>/dev/null; then
    PM="dnf"
  elif command -v zypper &>/dev/null; then
    PM="zypper"
  elif command -v apk &>/dev/null; then
    PM="apk"
  else
    draw_centered "${RED}❌ Error: No supported package manager found to install $cmd.${RESET}"
    exit 1
  fi

  # Handle LazyGit binary download for Linux since it's missing in many native repos
  if [ "$cmd" = "lazygit" ] && [ "$PM" != "brew" ] && [ "$PM" != "pacman" ]; then
    draw_centered "${BLUE}📦 Downloading LazyGit binary...${RESET}"
    LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -o '"tag_name": "v[^"]*"' | sed 's/"tag_name": "v//' | sed 's/"//')
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
      ARCH="x86_64"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
      ARCH="arm64"
    elif [ "$ARCH" = "i386" ] || [ "$ARCH" = "i686" ]; then
      ARCH="x86"
    else ARCH="x86_64"; fi

    if [ -n "$LAZYGIT_VERSION" ]; then
      curl -sLo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_${ARCH}.tar.gz"
      tar xf lazygit.tar.gz lazygit
      $SUDO_CMD install lazygit /usr/local/bin
      rm lazygit.tar.gz lazygit
    else
      draw_centered "${RED}❌ Error: Could not fetch LazyGit release version.${RESET}"
      exit 1
    fi
  else
    case "$PM" in
    apt-get)
      export DEBIAN_FRONTEND=noninteractive
      $SUDO_CMD apt-get update -y
      $SUDO_CMD apt-get install -y "$pkg"
      ;;
    brew)
      brew install "$pkg"
      ;;
    pacman)
      $SUDO_CMD pacman -Sy --noconfirm "$pkg"
      ;;
    dnf)
      $SUDO_CMD dnf install -y "$pkg"
      ;;
    zypper)
      $SUDO_CMD zypper install -y "$pkg"
      ;;
    apk)
      $SUDO_CMD apk add "$pkg"
      ;;
    esac
  fi

  if ! command -v "$cmd" &>/dev/null; then
    draw_centered "${RED}❌ Error: Failed to automatically install $cmd. Please install it manually.${RESET}"
    exit 1
  else
    draw_centered "${GREEN}✅ Successfully installed $cmd!${RESET}"
  fi
}

# Prerequisites
PREREQS=("nvim" "pi" "git" "curl" "lazygit" "rg" "ffplay")
for cmd in "${PREREQS[@]}"; do
  if ! command -v "$cmd" &>/dev/null; then
    install_dependency "$cmd"
  fi
done
sleep 0.2

# Repository Setup
EDE_DIR="$HOME/EDE"
if [ ! -d "$EDE_DIR" ]; then
  draw_centered "${BLUE}📥 Cloning Darwin EDE repository...${RESET}"
  git clone https://github.com/EasterCompany/EDE.git "$EDE_DIR" 2>&1 | draw_centered
else
  draw_centered "${BLUE}📂 Updating Darwin EDE repository...${RESET}"
  cd "$EDE_DIR" && git pull 2>&1 | draw_centered
fi
sleep 0.2

# Neovim Configuration Setup
NVIM_CONFIG_DIR="$HOME/.config/nvim"
if [ -d "$NVIM_CONFIG_DIR" ]; then
  # 1. Delete previous Darwin-created backups
  find "$(dirname "$NVIM_CONFIG_DIR")" -maxdepth 1 -name "${BACKUP_PREFIX}.*" -type d -exec rm -rf {} + 2>/dev/null || true

  # 2. Create new identifiable backup
  BACKUP_DIR="$HOME/.config/${BACKUP_PREFIX}.$(date +%Y%m%d_%H%M%S)"
  draw_centered "${BLUE}📦 Backing up existing Neovim configuration to:${RESET}"
  draw_centered "${BLUE}$(basename "$BACKUP_DIR")...${RESET}"
  mv "$NVIM_CONFIG_DIR" "$BACKUP_DIR"
fi
sleep 0.2

draw_centered "${CYAN}🔗 Installing Darwin Neovim configuration...${RESET}"
mkdir -p "$(dirname "$NVIM_CONFIG_DIR")"
cp -r "$EDE_DIR/nvim" "$NVIM_CONFIG_DIR"
chmod +x "$NVIM_CONFIG_DIR/scripts/darwin-cli.sh"
sleep 0.2

# Pi Agent Setup
PI_AGENT_DIR="$HOME/.pi/agent"
mkdir -p "$PI_AGENT_DIR/extensions"
draw_centered "${CYAN}🛠️ Configuring Pi Agent for Darwin...${RESET}"
cp "$EDE_DIR/pi/settings.json" "$PI_AGENT_DIR/settings.json"
cp "$EDE_DIR/pi/extensions/darwin-branding.ts" "$PI_AGENT_DIR/extensions/darwin-branding.ts"
cp "$EDE_DIR/pi/extensions/monitor.ts" "$PI_AGENT_DIR/extensions/monitor.ts"
cp "$EDE_DIR/pi/extensions/provider-easter.ts" "$PI_AGENT_DIR/extensions/provider-easter.ts"
cp "$EDE_DIR/pi/extensions/fetch.ts" "$PI_AGENT_DIR/extensions/fetch.ts"
cp "$EDE_DIR/pi/extensions/search.ts" "$PI_AGENT_DIR/extensions/search.ts"
cp "$EDE_DIR/pi/extensions/scaffold.ts" "$PI_AGENT_DIR/extensions/scaffold.ts"
cp "$EDE_DIR/pi/extensions/memory.ts" "$PI_AGENT_DIR/extensions/memory.ts"

# Pi Annotate Integration
draw_centered "${CYAN}🎨 Integrating Pi Annotate...${RESET}"
rm -rf "$PI_AGENT_DIR/packages/pi-annotate"
mkdir -p "$PI_AGENT_DIR/packages"
cp -r "$EDE_DIR/pi-annotate" "$PI_AGENT_DIR/packages/pi-annotate"
(cd "$PI_AGENT_DIR/packages/pi-annotate" && npm install --omit=dev) >/dev/null 2>&1

sed -i "s|/root/|$HOME/|g" "$PI_AGENT_DIR/settings.json"
sleep 0.2

# Darwin CLI Setup
draw_centered "${CYAN}🚀 Configuring Darwin CLI Aliases...${RESET}"
SHELL_CONFIG=""
if [[ "$SHELL" == *"zsh"* ]]; then
  SHELL_CONFIG="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
  SHELL_CONFIG="$HOME/.bashrc"
fi

DARWIN_AUTH_SCRIPT="$HOME/.config/nvim/scripts/darwin-auth.sh"
chmod +x "$DARWIN_AUTH_SCRIPT" 2>/dev/null
DARWIN_ANNOTATE_SCRIPT="$HOME/.config/nvim/scripts/setup-annotate.sh"
chmod +x "$DARWIN_ANNOTATE_SCRIPT" 2>/dev/null

if [ -n "$SHELL_CONFIG" ]; then
  if ! grep -q "alias darwin=" "$SHELL_CONFIG"; then
    echo "alias darwin='nvim'" >>"$SHELL_CONFIG"
    echo "alias ide='nvim'" >>"$SHELL_CONFIG"
  fi
  if ! grep -q "alias darwin-auth=" "$SHELL_CONFIG"; then
    echo "alias darwin-auth='$DARWIN_AUTH_SCRIPT'" >>"$SHELL_CONFIG"
  fi
  if ! grep -q "alias darwin-annotate=" "$SHELL_CONFIG"; then
    echo "alias darwin-annotate='$HOME/.config/nvim/scripts/setup-annotate.sh'" >>"$SHELL_CONFIG"
  fi
fi
sleep 0.2

if [ "$REMOTE_INSTALL" = true ]; then
  draw_centered "${BLUE}🗑️ Removing source repository ($EDE_DIR)...${RESET}"
  rm -rf "$EDE_DIR"
fi

# Show Installation Summary
SUMMARY="
${GREEN}======================================================
 Exec: ${RESET}${BOLD}darwin-auth${RESET}${GREEN} to authenticate with EID
 Exec: ${RESET}${BOLD}darwin-annotate${RESET}${GREEN} to setup Pi Annotate
 and access Darwin Cloud services via Darwin IDE
======================================================${RESET}
"
draw_centered "$SUMMARY"

# Stop the music now that setup is complete
[ -n "$FFPLAY_PID" ] && kill $FFPLAY_PID 2>/dev/null

# Login with EID
/root/.config/nvim/scripts/darwin-auth.sh

# Launch Darwin IDE
[ -n "$FFPLAY_PID" ] && kill $FFPLAY_PID 2>/dev/null
cd "$HOME"
exec nvim
