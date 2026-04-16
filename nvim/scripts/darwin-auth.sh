#!/bin/bash

# Darwin EID Authentication
# Logs in to EID and writes ~/.pi/agent/models.json with the EMS provider config.

EID_URL="https://easter.company/api/eid/login"
CREDENTIALS_FILE="$HOME/.ede/credentials.json"
MODELS_FILE="$HOME/.pi/agent/models.json"

RED="\033[31m"
GREEN="\033[32m"
CYAN="\033[36m"
BOLD="\033[1m"
RESET="\033[0m"

mkdir -p "$(dirname "$CREDENTIALS_FILE")"
mkdir -p "$(dirname "$MODELS_FILE")"

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
RESPONSE=$(curl -sf -X POST "$EID_URL" \
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
TOKEN=$(echo "$RESPONSE" | grep -o '"token": *"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"')

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

# Write the complete EMS provider config — darwin-auth owns this file
cat > "$MODELS_FILE" <<EOF
{
  "providers": {
    "easter-company": {
      "baseUrl": "https://easter.company/api/ems/v1",
      "apiKey": "$TOKEN",
      "api": "openai-completions",
      "models": [
        {
          "id": "darwin-cloud",
          "name": "Darwin Cloud"
        }
      ]
    }
  }
}
EOF

echo -e "${GREEN}✓ Authenticated as ${USERNAME}. Darwin is ready.${RESET}\n"
