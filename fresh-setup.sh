#!/usr/bin/env bash
#
# Fresh install for AutomationAI monorepo (from repo root):
#   ./fresh-setup.sh                     # clean node_modules + reinstall + db:push + build
#   ./fresh-setup.sh --reset-data        # also empty DB + delete frameworks/* (destructive)
#   ./fresh-setup.sh --wipe-db           # delete dev.db file + db:push (fresh SQLite file)
#   ./fresh-setup.sh --skip-build        # install only, no next build
#   ./fresh-setup.sh --dev               # after setup, run npm run dev
#
set -euo pipefail
 
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(basename "$SCRIPT_DIR")" == "scripts" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  ROOT="$SCRIPT_DIR"
fi
cd "$ROOT"
 
RESET_DATA=false
WIPE_DB=false
SKIP_BUILD=false
RUN_DEV=false
CREATE_ADMIN=false
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
 
usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}
 
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset-data)
      RESET_DATA=true
      shift
      ;;
    --wipe-db)
      WIPE_DB=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --dev)
      RUN_DEV=true
      shift
      ;;
    --create-admin)
      CREATE_ADMIN=true
      shift
      ;;
    --email)
      ADMIN_EMAIL="${2:-}"
      shift 2
      ;;
    --password)
      ADMIN_PASSWORD="${2:-}"
      shift 2
      ;;
    -h | --help)
      usage 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
done
 
echo "==> AutomationAI fresh setup (root: $ROOT)"
echo ""
 
echo "==> Removing node_modules and build caches..."
rm -rf node_modules
rm -rf apps/web/node_modules
rm -rf packages/shared/node_modules
rm -rf apps/web/.next
rm -rf apps/web/out
 
if [[ -d frameworks ]]; then
  while IFS= read -r -d '' dir; do
    rm -rf "$dir"
  done < <(find frameworks -name node_modules -type d -prune -print0 2>/dev/null || true)
fi
 
find . -name "tsconfig.tsbuildinfo" -not -path "./node_modules/*" -delete 2>/dev/null || true
 
echo "    Done."
echo ""
 
ENV_FILE="apps/web/.env"
ENV_EXAMPLE="apps/web/.env.example"
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    echo "==> Creating $ENV_FILE from .env.example..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "    Edit $ENV_FILE and set SESSION_SECRET before using the app in production."
  else
    echo "WARNING: $ENV_EXAMPLE not found — create $ENV_FILE manually." >&2
  fi
else
  echo "==> Keeping existing $ENV_FILE"
fi
echo ""
 
echo "==> npm install (workspaces)..."
npm install
echo ""
 
if [[ "$WIPE_DB" == true ]]; then
  echo "==> Removing SQLite database file(s)..."
  rm -f apps/web/dev.db apps/web/dev.db-journal
  rm -f apps/web/prisma/*.db apps/web/prisma/*.db-journal 2>/dev/null || true
  echo "    Done."
  echo ""
fi
 
if [[ "$RESET_DATA" == true ]]; then
  echo "==> Resetting database and removing frameworks/* (npm run db:reset)..."
  npm run db:reset
  echo ""
else
  echo "==> Applying Prisma schema (npm run db:push)..."
  npm run db:push
  echo ""
fi
 
if [[ "$CREATE_ADMIN" == true ]]; then
  if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
    echo "ERROR: --create-admin requires --email and --password" >&2
    exit 1
  fi
  echo "==> Creating platform admin..."
  npm run db:create-admin -- --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD"
  echo ""
fi
 
if [[ "$SKIP_BUILD" == false ]]; then
  echo "==> Building web app (npm run build)..."
  npm run build
  echo ""
fi
 
echo "==> Fresh setup complete."
echo ""
echo "Next steps:"
echo "  npm run dev          # http://localhost:3000"
if [[ "$RESET_DATA" == true && "$CREATE_ADMIN" == false ]]; then
  echo "  npm run db:create-admin -- --email you@example.com --password 'your-password'"
fi
echo ""
 
if [[ "$RUN_DEV" == true ]]; then
  echo "==> Starting dev server..."
  exec npm run dev
fi