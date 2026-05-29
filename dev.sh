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

# Watch packages/core and packages/core/web only when developing the packages
# locally (monorepo layout). In a fresh-install the packages are on npm — skip.
CORE_WATCH_PID=""
WEB_WATCH_PID=""
SYNC_PID=""

if [[ -d packages/core ]]; then
  echo -e "  Watching packages/core (schemas/types)…"
  npx --yes tsc -p packages/core/tsconfig.build.json --watch --preserveWatchOutput 2>&1 \
    | sed 's/^/[core] /' &
  CORE_WATCH_PID=$!

  echo -e "  Watching packages/core/web (web-support helpers)…"
  npx --yes tsc -p packages/core/web/tsconfig.build.json --watch --preserveWatchOutput 2>&1 \
    | sed 's/^/[web-support] /' &
  WEB_WATCH_PID=$!

  echo -e "  Watching packages/core/web/dist → sync to framework projects…"
  node scripts/sync-web-support.mjs --watch 2>&1 \
    | sed 's/^/[sync] /' &
  SYNC_PID=$!
else
  echo -e "  packages/ not found — using published npm packages (no local watch needed)"
fi

# Terminate background watchers when the dev server exits
trap "kill \$CORE_WATCH_PID \$WEB_WATCH_PID \$SYNC_PID 2>/dev/null; exit" INT TERM EXIT

exec npm run dev
