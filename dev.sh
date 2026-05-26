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

# Watch packages/core and packages/core/web — rebuild on source changes so the
# platform (via file: symlink) and framework projects (synced at runtime) always
# pick up the latest code without requiring a publish or manual dist copy.
echo -e "  Watching packages/core (schemas/types)…"
npx --yes tsc -p packages/core/tsconfig.build.json --watch --preserveWatchOutput 2>&1 \
  | sed 's/^/[core] /' &
CORE_WATCH_PID=$!

echo -e "  Watching packages/core/web (web-support helpers)…"
npx --yes tsc -p packages/core/web/tsconfig.build.json --watch --preserveWatchOutput 2>&1 \
  | sed 's/^/[web-support] /' &
WEB_WATCH_PID=$!

# After each web-support rebuild, auto-sync dist to _shared-web and all
# existing project frameworks so running projects pick up changes immediately.
echo -e "  Watching packages/core/web/dist → sync to framework projects…"
node scripts/sync-web-support.mjs --watch 2>&1 \
  | sed 's/^/[sync] /' &
SYNC_PID=$!

# Terminate background watchers when the dev server exits
trap "kill \$CORE_WATCH_PID \$WEB_WATCH_PID \$SYNC_PID 2>/dev/null; exit" INT TERM EXIT

exec npm run dev
