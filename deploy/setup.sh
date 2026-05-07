#!/usr/bin/env bash
# One-time server setup for DDO Builder on the beyond4ever server.
# Run as the user account that will own the app (not root).
# Usage: bash setup.sh

set -euo pipefail

REPO_URL="https://github.com/JamesCfer/DDOBuilderV3.git"
APP_DIR="$HOME/DDOBuilderV3"
PORT=8756

echo "=== DDO Builder — initial server setup ==="

# ── 1. Node.js (via nvm if not already present) ──────────────────────────────
if ! command -v node &>/dev/null; then
  echo "Installing nvm + Node.js LTS..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
else
  echo "Node.js already installed: $(node -v)"
fi

# ── 2. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
fi

# ── 3. Clone / update repo ───────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "Repo already cloned — pulling latest main..."
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout main
  git -C "$APP_DIR" pull origin main
else
  echo "Cloning repository..."
  git clone --branch main "$REPO_URL" "$APP_DIR"
fi

# ── 4. .env file ─────────────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/webapp/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "Where are the DDO XML data files on this server?"
  echo "(e.g. /home/you/Output/DataFiles)"
  read -rp "DATA_FILES_PATH: " DATA_PATH
  cat > "$ENV_FILE" <<EOF
PORT=$PORT
NODE_ENV=production
DATA_FILES_PATH=$DATA_PATH
EOF
  echo ".env written to $ENV_FILE"
else
  echo ".env already exists at $ENV_FILE — skipping"
fi

# ── 5. Install deps + build ───────────────────────────────────────────────────
echo "Installing dependencies..."
npm --prefix "$APP_DIR/webapp" install --omit=dev

echo "Building..."
npm --prefix "$APP_DIR/webapp" run build

# ── 6. Start / restart via PM2 ───────────────────────────────────────────────
echo "Starting app with PM2..."
cd "$APP_DIR/webapp"
pm2 delete ddo-builder 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# ── 7. PM2 startup (survive reboots) ─────────────────────────────────────────
echo ""
echo "To make PM2 survive reboots, run the command printed below:"
pm2 startup | tail -1

echo ""
echo "=== Setup complete ==="
echo "App running on http://$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):$PORT"
