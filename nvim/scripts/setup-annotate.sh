#!/bin/bash
# Darwin IDE: Pi Annotate Helper
# (C) 2026 Easter Company

set -e

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}Darwin IDE: Pi Annotate Setup${RESET}"
echo -e "To use Pi Annotate, you must:"
echo -e "1. Open Chrome/Chromium and go to ${BOLD}chrome://extensions${RESET}"
echo -e "2. Enable ${BOLD}Developer mode${RESET} (top right)"
echo -e "3. Click ${BOLD}Load unpacked${RESET} and select:"
echo -e "   ${BOLD}$HOME/.pi/agent/packages/pi-annotate/chrome-extension${RESET}"
echo -e "4. Copy the ${BOLD}Extension ID${RESET} shown on the card."

read -p "Enter the Extension ID: " EXT_ID

if [ -n "$EXT_ID" ]; then
    # Install for current user (root)
    bash "$HOME/.pi/agent/packages/pi-annotate/chrome-extension/native/install.sh" "$EXT_ID"
    
    # Check if 'owen' user exists and install for them too
    if id "owen" &>/dev/null; then
        echo -e "${CYAN}Installing for user 'owen'...${RESET}"
        OWEN_HOME=$(eval echo "~owen")
        OWEN_CONFIG="$OWEN_HOME/.config/chromium/NativeMessagingHosts"
        sudo -u owen mkdir -p "$OWEN_CONFIG"
        
        # Copy the manifest created by the installer to owen's config
        # The installer creates it in root's config, we'll replicate it
        MANIFEST_FILE="com.pi.annotate.json"
        ROOT_CONFIG="$HOME/.config/chromium/NativeMessagingHosts/$MANIFEST_FILE"
        
        if [ -f "$ROOT_CONFIG" ]; then
            sudo cp "$ROOT_CONFIG" "$OWEN_CONFIG/$MANIFEST_FILE"
            sudo chown owen:owen "$OWEN_CONFIG/$MANIFEST_FILE"
            echo -e "${GREEN}✅ Native host installed for 'owen'!${RESET}"
        fi
    fi
    echo -e "${GREEN}✅ Setup complete! Please fully restart Chromium as 'owen'.${RESET}"
else
    echo -e "Skipping native host installation."
fi
