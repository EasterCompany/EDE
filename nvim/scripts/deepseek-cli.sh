#!/bin/bash

# DeepSeek CLI — launches the Pi agent with OpenCode's DeepSeek V4 Flash Free model.
# Lazy-loaded: does not start until opened by Ctrl+; in neovim.

# Check for OpenCode credentials
AUTH_FILE="$HOME/.local/share/opencode/auth.json"
if [ ! -f "$AUTH_FILE" ]; then
    echo ""
    echo "  DeepSeek CLI requires an OpenCode Zen / Go subscription."
    echo "  Run 'opencode providers login' to authenticate."
    echo ""
    read -p "Press [Enter] to close..."
    exit 0
fi

# Check if user already provided a model flag
HAS_MODEL=false
for arg in "$@"; do
    if [[ "$arg" == "--model" || "$arg" == "-m" || "$arg" == --model=* ]]; then
        HAS_MODEL=true
        break
    fi
done

if [ "$HAS_MODEL" = false ]; then
    set -- --model opencode/deepseek-v4-flash-free "$@"
fi

set -- --thinking high --models "opencode/*" "$@"

# Session continuation: resume project session if active within 48 hours
NOW=$(date +%s)
CWD_SAFE=$(echo "$PWD" | sed 's/^\///; s/\//-/g; s/$/-/')
SESSION_DIR="$HOME/.pi/agent/sessions/--${CWD_SAFE}-"

USE_CONTINUE=false
if [ -d "$SESSION_DIR" ]; then
    LATEST_SESSION=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -n 1)
    if [ -n "$LATEST_SESSION" ]; then
        LAST_MOD=$(stat -c %Y "$LATEST_SESSION")
        DIFF=$((NOW - LAST_MOD))
        if [ $DIFF -le 172800 ]; then
            USE_CONTINUE=true
        fi
    fi
fi

if [ "$USE_CONTINUE" = true ]; then
    set -- --session "$LATEST_SESSION" "$@"
fi

if ! command -v pi >/dev/null 2>&1; then
    echo ""
    echo "  Error: 'pi' command not found."
    echo "  Ensure pi-coding-agent is installed and in your PATH."
    echo ""
    read -p "Press [Enter] to close..."
    exit 0
fi

pi "$@"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "  DeepSeek CLI exited with error code: $EXIT_CODE"
    read -p "Press [Enter] to close..."
fi

exit 0
