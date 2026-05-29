#!/bin/bash

# Darwin CLI — unified chat instance with access to all models and backends.
# All traffic routes through EMS (Easter Model Service): client → EMS → model backend.
# Requires EID authentication via `darwin-auth`.

CREDENTIALS_FILE="$HOME/.ede/credentials.json"

# ── Check EID credentials ──
if [ ! -f "$CREDENTIALS_FILE" ]; then
    echo ""
    echo "  Darwin requires an EID account."
    echo "  Run 'darwin-auth' to authenticate."
    echo ""
    read -p "Press [Enter] to close..."
    exit 0
fi

TOKEN=$(grep -o '"token": *"[^"]*"' "$CREDENTIALS_FILE" | grep -o '"[^"]*"$' | tr -d '"')
EXPIRES_AT=$(grep -o '"expires_at": *[0-9]*' "$CREDENTIALS_FILE" | grep -o '[0-9]*$')
NOW=$(date +%s)

if [ -z "$TOKEN" ] || [ -z "$EXPIRES_AT" ] || [ "$NOW" -ge "$EXPIRES_AT" ]; then
    echo ""
    echo "  Your Darwin session has expired."
    echo "  Run 'darwin-auth' to re-authenticate."
    echo ""
    read -p "Press [Enter] to close..."
    exit 0
fi

export DARWIN_TOKEN="$TOKEN"

# ── Default model ──
HAS_MODEL=false
for arg in "$@"; do
    if [[ "$arg" == "--model" || "$arg" == "-m" || "$arg" == --model=* ]]; then
        HAS_MODEL=true
        break
    fi
done

if [ "$HAS_MODEL" = false ]; then
    set -- --model easter-company/darwin-easter "$@"
fi

# Only allow the single darwin-easter model
set -- --thinking high --models "easter-company/darwin-easter" "$@"

# ── Session continuation (48-hour window) ──
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

# ── Update check ──
tput civis
TMP_LOG=$(mktemp)
pi update > "$TMP_LOG" 2>&1 &
UPDATE_PID=$!

FRAMES=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
IDX=0

echo ""

while kill -0 $UPDATE_PID 2>/dev/null; do
    printf "\r\033[K  \033[38;5;87m%s\033[0m Checking for updates..." "${FRAMES[$IDX]}"
    IDX=$(( (IDX + 1) % ${#FRAMES[@]} ))
    sleep 0.08
done

wait $UPDATE_PID
UPDATE_EXIT=$?

printf "\r\033[K"
if [ $UPDATE_EXIT -ne 0 ]; then
    echo -e "  \033[33m⚠\033[0m Minor anomalies during update (Code $UPDATE_EXIT). Continuing..."
fi

tput cnorm
rm -f "$TMP_LOG"

hash -r

# ── Launch pi ──
pi "$@"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "  Darwin CLI exited with error code: $EXIT_CODE"
    read -p "Press [Enter] to close..."
fi

exit 0
