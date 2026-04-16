#!/bin/bash

# Darwin EID Authentication
# Logs in to EID and stores credentials for use by Darwin (EMS via Pi agent).

EID_URL="http://100.100.1.0:8080"
CREDENTIALS_FILE="$HOME/.ede/credentials.json"
MODELS_FILE="$HOME/.pi/agent/models.json"

RED="\033[31m"
GREEN="\033[32m"
CYAN="\033[36m"
BOLD="\033[1m"
RESET="\033[0m"

mkdir -p "$(dirname "$CREDENTIALS_FILE")"

echo -e "\n${BOLD}${CYAN}Darwin — EID Authentication${RESET}\n"

# Prompt for credentials
printf "EID Username: "
read -r USERNAME

printf "Password: "
read -rs PASSWORD
echo

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
    echo -e "${RED}Error: username and password are required.${RESET}"
    exit 1
fi

# Call EID login endpoint
RESPONSE=$(curl -sf -X POST "$EID_URL/api/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$(echo "$USERNAME" | sed 's/"/\\"/g')\", \"password\": \"$(echo "$PASSWORD" | sed 's/"/\\"/g')\"}" \
    2>&1)

if [ $? -ne 0 ] || [ -z "$RESPONSE" ]; then
    echo -e "${RED}Error: Could not reach EID at $EID_URL. Are you on the network?${RESET}"
    exit 1
fi

# Check for error field
if echo "$RESPONSE" | grep -q '"error"'; then
    ERR=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    echo -e "${RED}Login failed: ${ERR}${RESET}"
    exit 1
fi

# Extract token
TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Error: No token in response.${RESET}"
    exit 1
fi

# Store credentials with expiry (7 days from now)
EXPIRES_AT=$(date -d "+7 days" +%s 2>/dev/null || date -v+7d +%s 2>/dev/null)
cat > "$CREDENTIALS_FILE" <<EOF
{
  "token": "$TOKEN",
  "expires_at": $EXPIRES_AT
}
EOF
chmod 600 "$CREDENTIALS_FILE"

# Update pi models.json with the token as apiKey for the ems provider
if [ -f "$MODELS_FILE" ]; then
    if command -v jq &>/dev/null; then
        TMP=$(mktemp)
        jq --arg token "$TOKEN" '.providers.ems.apiKey = $token' "$MODELS_FILE" > "$TMP" && mv "$TMP" "$MODELS_FILE"
    else
        # Fallback: rewrite from template (clobbers any local edits)
        EDE_DIR="$HOME/EDE"
        if [ -f "$EDE_DIR/pi/models.json" ]; then
            sed "s|\"api\": \"openai-completions\"|\"apiKey\": \"$TOKEN\",\n      \"api\": \"openai-completions\"|" \
                "$EDE_DIR/pi/models.json" > "$MODELS_FILE"
        fi
    fi
else
    # No models.json yet — create it with the token
    EDE_DIR="$HOME/EDE"
    if [ -f "$EDE_DIR/pi/models.json" ] && command -v jq &>/dev/null; then
        jq --arg token "$TOKEN" '.providers.ems.apiKey = $token' "$EDE_DIR/pi/models.json" > "$MODELS_FILE"
    fi
fi

echo -e "${GREEN}✓ Authenticated as ${USERNAME}. Darwin is ready.${RESET}\n"
