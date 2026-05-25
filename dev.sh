#!/usr/bin/env bash
#
# Start AutomationAI in development mode.
# Run ./fresh-setup.sh first if this is a new clone.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

bold="\033[1m"; green="\033[0;32m"; yellow="\033[0;33m"; reset="\033[0m"

# Check node_modules installed
if [[ ! -d node_modules ]]; then
  echo -e "${yellow}node_modules not found — run ./fresh-setup.sh first${reset}"
  exit 1
fi

# Check .env exists
if [[ ! -f apps/web/.env ]]; then
  echo -e "${yellow}.env not found — run ./fresh-setup.sh first${reset}"
  exit 1
fi

echo -e "${bold}${green}Starting AutomationAI dev server${reset}"
echo -e "  URL: ${bold}http://localhost:3000${reset}\n"

exec npm run dev
