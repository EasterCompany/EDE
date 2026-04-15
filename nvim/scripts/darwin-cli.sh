#!/bin/bash

# Prepend default flags to args: smallest model
# pi uses --model
set -- --model gemini-3-flash-preview "$@"

# Check for existing project-specific session and enforce 48-hour lifecycle
CWD_SAFE=$(echo "$PWD" | sed 's/^\///; s/\//-/g; s/$/-/')
SESSION_DIR="$HOME/.pi/agent/sessions/--${CWD_SAFE}-"

USE_CONTINUE=false
if [ -d "$SESSION_DIR" ]; then
    LATEST_SESSION=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -n 1)
    if [ -n "$LATEST_SESSION" ]; then
        # Get file modification time in seconds
        LAST_MOD=$(stat -c %Y "$LATEST_SESSION")
        NOW=$(date +%s)
        DIFF=$((NOW - LAST_MOD))
        # 48 hours = 172800 seconds
        if [ $DIFF -le 172800 ]; then
            USE_CONTINUE=true
        fi
    fi
fi

if [ "$USE_CONTINUE" = true ]; then
    set -- --session "$LATEST_SESSION" "$@"
fi

# We use exec to replace the shell process with pi directly.
exec pi "$@"

