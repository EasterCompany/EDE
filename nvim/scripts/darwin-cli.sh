#!/bin/bash

# Darwin CLI — launches the Pi agent routed through EMS (Darwin Cloud).
# Requires prior authentication via `darwin-auth`.

CREDENTIALS_FILE="$HOME/.ede/credentials.json"

# Check for stored EID credentials
if [ ! -f "$CREDENTIALS_FILE" ]; then
    echo ""
    echo "  Darwin requires an EID account to use Darwin Cloud."
    echo "  Run 'darwin-auth' to authenticate."
    echo ""
    exit 1
fi

# Check token expiry
TOKEN=$(grep -o '"token": *"[^"]*"' "$CREDENTIALS_FILE" | grep -o '"[^"]*"$' | tr -d '"')
EXPIRES_AT=$(grep -o '"expires_at": *[0-9]*' "$CREDENTIALS_FILE" | grep -o '[0-9]*$')
NOW=$(date +%s)

if [ -z "$TOKEN" ] || [ -z "$EXPIRES_AT" ] || [ "$NOW" -ge "$EXPIRES_AT" ]; then
    echo ""
    echo "  Your Darwin session has expired."
    echo "  Run 'darwin-auth' to re-authenticate."
    echo ""
    exit 1
fi

set -- --model easter-company/darwin-cloud "$@"

# Session continuation: resume project session if active within 48 hours
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

exec pi "$@"
