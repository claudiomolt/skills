#!/bin/bash
# NWC Monitor — Uninstall
set -euo pipefail

INSTALL_DIR="${NWC_MONITOR_DIR:-$HOME/.nwc-monitor}"
SERVICE_FILE="$HOME/.config/systemd/user/nwc-monitor.service"

systemctl --user stop nwc-monitor 2>/dev/null || true
systemctl --user disable nwc-monitor 2>/dev/null || true
rm -f "$SERVICE_FILE"
systemctl --user daemon-reload

echo "⚠️  Service removed. Data preserved at $INSTALL_DIR"
echo "   To fully remove: rm -rf $INSTALL_DIR"
