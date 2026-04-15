#!/bin/bash

# Prepend default flags to args: smallest model
# pi uses --model
set -- --model gemini-3-flash-preview "$@"

# Just run pi. Pi handles session persistence internally via its own mechanisms
# and --continue is the standard way to resume the latest session.
# We use exec to replace the shell process with pi directly.
exec pi --continue "$@"
