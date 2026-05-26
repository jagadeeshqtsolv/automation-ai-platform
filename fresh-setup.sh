#!/usr/bin/env bash
#
# AutomationAI — fresh install script
#
# Usage:
#   ./fresh-setup.sh                     # clean + install + db:push + build
#   ./fresh-setup.sh --skip-build        # clean + install + db:push (skip next build)
#   ./fresh-setup.sh --wipe-db           # also delete dev.db (fresh SQLite)
#   ./fresh-setup.sh --reset-data        # wipe db + delete frameworks/* (destructive)
#   ./fresh-setup.sh --create-admin      # prompt for admin email/password after setup
#   ./fresh-setup.sh --dev               # start dev server after setup
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── colour helpers ─────────────────────────────────────────────────────────────
bold="\033[1m"; green="\033[0;32m"; yellow="\033[0;33m"; red="\033[0;31m"; reset="\033[0m"
step()  { echo -e "\n${bold}${green}==>${reset} $*"; }
warn()  { echo -e "${yellow}WARNING:${reset} $*" >&2; }
error() { echo -e "${red}ERROR:${reset} $*" >&2; exit 1; }

# ── flags ──────────────────────────────────────────────────────────────────────
SKIP_BUILD=false
WIPE_DB=false
RESET_DATA=false
CREATE_ADMIN=false
RUN_DEV=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)  SKIP_BUILD=true;  shift ;;
    --wipe-db)     WIPE_DB=true;     shift ;;
    --reset-data)  RESET_DATA=true;  shift ;;
    --create-admin) CREATE_ADMIN=true; shift ;;
    --dev)         RUN_DEV=true;     shift ;;
    -h|--help)
      sed -n '3,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) error "Unknown option: $1" ;;
  esac
done

echo -e "${bold}AutomationAI — fresh setup${reset}"

# ── 1. GitHub Packages auth ────────────────────────────────────────────────────
step "Checking GitHub Packages auth (@jagadeeshqtsolv registry)"
# Check if token already set in ~/.npmrc
if ! grep -q "npm.pkg.github.com/:_authToken" "${HOME}/.npmrc" 2>/dev/null; then
  warn "GitHub Packages token not found in ~/.npmrc"
  echo -n "  Enter your GitHub PAT (needs read:packages scope): "
  read -r GITHUB_TOKEN
  if [[ -z "$GITHUB_TOKEN" ]]; then
    error "Token required to install @automation-ai/core from GitHub Packages"
  fi
  npm set //npm.pkg.github.com/:_authToken="$GITHUB_TOKEN"
  echo "  Token saved to ~/.npmrc"
else
  echo "  Token already configured — skipping"
fi

# ── 2. Clean build artifacts ───────────────────────────────────────────────────
step "Cleaning node_modules and build caches"
rm -rf node_modules
rm -rf apps/web/node_modules
rm -rf packages/core/node_modules
rm -rf packages/core/dist
rm -rf apps/web/.next
rm -rf apps/web/out

# Clean framework node_modules (not the user's project files)
find frameworks -name node_modules -type d -prune -exec rm -rf {} + 2>/dev/null || true
find . -name "tsconfig.tsbuildinfo" ! -path "*/node_modules/*" -delete 2>/dev/null || true

echo "  Done"

# ── 3. .env setup ─────────────────────────────────────────────────────────────
step "Checking .env"
ENV_FILE="apps/web/.env"
ENV_EXAMPLE="apps/web/.env.example"
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "  Created $ENV_FILE from .env.example"
    warn "Edit $ENV_FILE and set SESSION_SECRET before use"
  else
    error "$ENV_EXAMPLE not found — create $ENV_FILE manually"
  fi
else
  echo "  $ENV_FILE exists — keeping"
fi

# ── 4. Install dependencies ────────────────────────────────────────────────────
step "Installing dependencies (npm install)"
npm install

# ── 4b. Build local packages ───────────────────────────────────────────────────
step "Building local packages (core schemas + web-support)"
# core — apps/web now uses a file: dep so the symlink already points here;
# we just need the dist to exist before next build.
npm run build --workspace=@jagadeeshqtsolv/core
# web-support — synced into framework project node_modules at runtime; build
# it now so the dist is ready for the first project that gets installed.
npm run build --workspace=@jagadeeshqtsolv/web-support

# ── 5. Database ────────────────────────────────────────────────────────────────
if [[ "$RESET_DATA" == true ]]; then
  step "Resetting database and frameworks data"
  rm -f apps/web/dev.db apps/web/dev.db-journal
  find frameworks -mindepth 2 -maxdepth 2 -type d -exec rm -rf {} + 2>/dev/null || true
  npm run db:push
elif [[ "$WIPE_DB" == true ]]; then
  step "Wiping SQLite database"
  rm -f apps/web/dev.db apps/web/dev.db-journal apps/web/prisma/*.db 2>/dev/null || true
  npm run db:push
else
  step "Applying Prisma schema (db:push)"
  npm run db:push
fi

# ── 6. Create admin (optional) ────────────────────────────────────────────────
if [[ "$CREATE_ADMIN" == true ]]; then
  step "Creating platform admin"
  echo -n "  Admin email: "
  read -r ADMIN_EMAIL
  echo -n "  Admin password: "
  read -rs ADMIN_PASSWORD
  echo ""
  npm run db:create-admin -- --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD"
fi

# ── 7. Build ───────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  step "Building Next.js app"
  npm run build
fi

# ── Done ───────────────────────────────────────────────────────────────────────
echo -e "\n${bold}${green}✓ Setup complete${reset}\n"
echo "  Start dev server:  ./dev.sh"
echo "  Start prod server: npm start"
if [[ "$RESET_DATA" == true && "$CREATE_ADMIN" == false ]]; then
  echo ""
  echo "  Create admin:      npm run db:create-admin -- --email you@example.com --password 'yourpass'"
fi
echo ""

if [[ "$RUN_DEV" == true ]]; then
  step "Starting dev server"
  exec npm run dev
fi
