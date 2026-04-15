#!/bin/bash

# Darwin IDE: Unified Installer
# (C) 2026 Easter Company

set -e

# Darwin ASCII Art
DARWIN_ART="
██████╗  █████╗ ██████╗ ██╗    ██╗██╗███╗   ██╗
██╔══██╗██╔══██╗██╔══██╗██║    ██║██║████╗  ██║
██║  ██║███████║██████╔╝██║ █╗ ██║██║██╔██╗ ██║
██║  ██║██╔══██║██╔══██╗██║███╗██║██║██║╚██╗██║
██████╔╝██║  ██║██║  ██║╚███╔███╔╝██║██║ ╚████║
╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝

            EASTER COMPANY DARWIN IDE
"

echo "$DARWIN_ART"
echo "Starting Darwin IDE installation..."

# Prerequisites
PREREQS=("nvim" "pi" "git" "curl")
for cmd in "${PREREQS[@]}"; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "❌ Error: $cmd is not installed. Please install it before running this script."
    exit 1
  fi
done

# Repository Setup
EDE_DIR="$HOME/EDE"
if [ ! -d "$EDE_DIR" ]; then
  echo "📥 Cloning Darwin EDE repository..."
  git clone https://github.com/EasterCompany/EDE.git "$EDE_DIR"
else
  echo "📂 Updating Darwin EDE repository..."
  cd "$EDE_DIR" && git pull
fi

# Neovim Configuration Setup
NVIM_CONFIG_DIR="$HOME/.config/nvim"
if [ -d "$NVIM_CONFIG_DIR" ]; then
  BACKUP_DIR="$HOME/.config/nvim.backup.$(date +%Y%m%d_%H%M%S)"
  echo "📦 Backing up existing Neovim configuration to $BACKUP_DIR..."
  mv "$NVIM_CONFIG_DIR" "$BACKUP_DIR"
fi

echo "🔗 Installing Darwin Neovim configuration..."
mkdir -p "$(dirname "$NVIM_CONFIG_DIR")"
cp -r "$EDE_DIR/nvim" "$NVIM_CONFIG_DIR"
chmod +x "$NVIM_CONFIG_DIR/scripts/darwin-cli.sh"

# Pi Agent Setup
PI_AGENT_DIR="$HOME/.pi/agent"
mkdir -p "$PI_AGENT_DIR/extensions"
echo "🛠️ Configuring Pi Agent for Darwin..."
cp "$EDE_DIR/pi/settings.json" "$PI_AGENT_DIR/settings.json"
cp "$EDE_DIR/pi/extensions/darwin-branding.ts" "$PI_AGENT_DIR/extensions/darwin-branding.ts"
cp "$EDE_DIR/pi/extensions/monitor.ts" "$PI_AGENT_DIR/extensions/monitor.ts"
# Update path in settings.json to match user's home
sed -i "s|/root/|$HOME/|g" "$PI_AGENT_DIR/settings.json"

# Darwin CLI Setup
echo "🚀 Configuring Darwin CLI..."
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
    echo "✅ Added 'darwin' and 'ide' aliases to $SHELL_CONFIG"
  fi
fi

echo "======================================"
echo " Darwin IDE successfully installed!   "
echo " Run 'darwin' or 'nvim' to start.     "
echo "======================================"
