#!/bin/bash

# Gemini Agent — Twin Engine instance of Darwin IDE.
# Inherits all Darwin tools, context, and extensions.

# ── Use dedicated Gemini Agent settings ──
# This ensures we don't conflict with the Darwin instance but share extensions.
export PI_SETTINGS="$HOME/.pi/agent/settings.json"

# Force Gemini provider and model
pi --provider gemini-agent --model gemini-3.1-pro-preview --quiet-startup --compact-tools "$@"

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "  Gemini Agent exited with error code: $EXIT_CODE"
    read -p "Press [Enter] to close..."
fi

exit 0
