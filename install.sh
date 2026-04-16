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

# Parse Flags
AUTO_CONFIRM=false
while getopts "y" opt; do
  case $opt in
    y) AUTO_CONFIRM=true ;;
    *) echo "Usage: $0 [-y]" >&2; exit 1 ;;
  esac
done

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
        local padding=$(( (term_width - length) / 2 ))
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
# Pre-flight for 'curl | bash' users (download music before animation starts)
if [ ! -f "$(dirname "$0")/installer_bgm.mp3" ] && [ ! -f "/tmp/installer_bgm.mp3" ]; then
    curl -sLo /tmp/installer_bgm.mp3 https://raw.githubusercontent.com/EasterCompany/EDE/main/installer_bgm.mp3
fi

# Background Music
MUSIC_FILE="$(dirname "$0")/installer_bgm.mp3"
if [ ! -f "$MUSIC_FILE" ] && [ -f "/tmp/installer_bgm.mp3" ]; then
    MUSIC_FILE="/tmp/installer_bgm.mp3"
fi

if [ -f "$MUSIC_FILE" ]; then
    # --input-terminal=no prevents mpv from grabbing the terminal, 
    # which can cause it to stop immediately when backgrounded in some shells.
    mpv --no-video --loop=inf --input-terminal=no "$MUSIC_FILE" > /dev/null 2>&1 &
    MPV_PID=$!
    trap "kill $MPV_PID 2>/dev/null; rm -f /tmp/installer_bgm.mp3" EXIT
fi

animate_intro

draw_centered "${BOLD}${CYAN}Starting Darwin IDE installation...${RESET}"

# Prerequisites
PREREQS=("nvim" "pi" "git" "curl" "lazygit" "mpv")
for cmd in "${PREREQS[@]}"; do
  if ! command -v "$cmd" &> /dev/null; then
    draw_centered "${RED}❌ Error: $cmd is not installed. Please install it before running this script.${RESET}"
    exit 1
  fi
done
sleep 0.2

# Pre-flight for 'curl | bash' users
if [ ! -f "$(dirname "$0")/installer_bgm.mp3" ] && [ ! -f "/tmp/installer_bgm.mp3" ]; then
    draw_centered "${BLUE}📦 Fetching installer assets...${RESET}"
    curl -sLo /tmp/installer_bgm.mp3 https://raw.githubusercontent.com/EasterCompany/EDE/main/installer_bgm.mp3
fi

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
  draw_centered "${BLUE}📦 Backing up existing Neovim configuration to $(basename "$BACKUP_DIR")...${RESET}"
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

if [ -n "$SHELL_CONFIG" ]; then
  if ! grep -q "alias darwin=" "$SHELL_CONFIG"; then
    echo "alias darwin='nvim'" >> "$SHELL_CONFIG"
    echo "alias ide='nvim'" >> "$SHELL_CONFIG"
  fi
fi
sleep 0.2

# Post-Install Cleanup Prompt
echo -e "\n"
DELETE_REPO=false
if [ "$AUTO_CONFIRM" = true ]; then
    DELETE_REPO=true
else
    draw_centered "${BOLD}${ORANGE}Delete (Y) or Keep (n) the source code repository?${RESET}"
    read -n 1 -r REPLY < /dev/tty
    echo -e "\n"
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        DELETE_REPO=true
    fi
fi

# Final Summary Screen
SUMMARY="
${GREEN}======================================================
         ${BOLD}Install Complete, press any key to start.${RESET}${GREEN}
======================================================
"

echo -e "\n"
draw_centered "$SUMMARY"
read -n 1 -s < /dev/tty

if [ "$DELETE_REPO" = true ]; then
    draw_centered "${BLUE}🗑️ Removing source repository ($EDE_DIR)...${RESET}"
    rm -rf "$EDE_DIR"
fi
