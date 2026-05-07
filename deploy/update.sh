#!/usr/bin/env bash
# Called by GitHub Actions (or manually) to pull latest main and restart.
# Must be run from the repo root or with APP_DIR set.

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/DDOBuilderV3}"

echo "=== DDO Builder — deploying latest ==="

# Load nvm if node isn't in PATH (common for non-interactive SSH sessions)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

cd "$APP_DIR"

echo "Pulling main..."
git fetch origin
git checkout main
git pull origin main

echo "Installing dependencies..."
npm --prefix webapp install --omit=dev

echo "Building..."
npm --prefix webapp run build

echo "Restarting PM2..."
pm2 reload ddo-builder --update-env || pm2 start webapp/ecosystem.config.cjs

echo "=== Deploy done ==="
pm2 list
