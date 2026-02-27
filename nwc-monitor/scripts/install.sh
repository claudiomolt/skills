#!/bin/bash
# NWC Monitor — Install & Setup
# Installs nwc-monitor, configures systemd service, creates config directory
set -euo pipefail

REPO="https://github.com/claudiomolt/nwc-monitor.git"
INSTALL_DIR="${NWC_MONITOR_DIR:-$HOME/.nwc-monitor}"
CONFIG_FILE="$INSTALL_DIR/config.yml"
SERVICE_FILE="$HOME/.config/systemd/user/nwc-monitor.service"

# Detect bun
BUN_PATH="$(which bun 2>/dev/null || echo "")"
if [ -z "$BUN_PATH" ]; then
  echo "❌ bun not found. Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "✅ bun found: $BUN_PATH"

# Detect openclaw (optional, for session_send action)
OPENCLAW_PATH="$(which openclaw 2>/dev/null || echo "")"
EXTRA_PATH=""
if [ -n "$OPENCLAW_PATH" ]; then
  echo "✅ openclaw found: $OPENCLAW_PATH"
  EXTRA_PATH="$(dirname "$OPENCLAW_PATH"):"
fi

# Clone or update repo
if [ -d "$INSTALL_DIR/repo" ]; then
  echo "📦 Updating nwc-monitor..."
  cd "$INSTALL_DIR/repo" && git pull --ff-only
else
  echo "📦 Installing nwc-monitor..."
  mkdir -p "$INSTALL_DIR"
  git clone "$REPO" "$INSTALL_DIR/repo"
fi

# Install deps & build
cd "$INSTALL_DIR/repo"
"$BUN_PATH" install --frozen-lockfile 2>/dev/null || "$BUN_PATH" install
"$BUN_PATH" run build
echo "✅ Built successfully"

# Create config from example if not exists
if [ ! -f "$CONFIG_FILE" ]; then
  cp "$INSTALL_DIR/repo/config/default.yml" "$CONFIG_FILE"
  echo "📝 Config created at $CONFIG_FILE — edit with your NWC connection string"
else
  echo "✅ Config exists: $CONFIG_FILE"
fi

# Create data dir
mkdir -p "$INSTALL_DIR/data"

# Create systemd service
mkdir -p "$(dirname "$SERVICE_FILE")"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=NWC Monitor — Lightning payment monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR/repo
ExecStart=$BUN_PATH run dist/index.js --config $CONFIG_FILE
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=HOME=$HOME
Environment=PATH=${EXTRA_PATH}$(dirname "$BUN_PATH"):/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
echo "✅ systemd service created"

# Enable but don't start (user needs to configure first)
if grep -q "nostr+walletconnect://PUBKEY" "$CONFIG_FILE" 2>/dev/null; then
  echo ""
  echo "⚠️  Edit $CONFIG_FILE with your NWC connection string, then run:"
  echo "   systemctl --user enable --now nwc-monitor"
else
  systemctl --user enable --now nwc-monitor
  echo "✅ Service enabled and started"
fi

echo ""
echo "⚡ NWC Monitor installed!"
echo "   Config:  $CONFIG_FILE"
echo "   Logs:    journalctl --user -u nwc-monitor -f"
echo "   Status:  systemctl --user status nwc-monitor"
