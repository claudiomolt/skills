#!/bin/bash
# NWC CLI wrapper — resolves modules from nwc-monitor install dir
set -euo pipefail
INSTALL_DIR="${NWC_MONITOR_DIR:-$HOME/.nwc-monitor}"
REPO_DIR="$INSTALL_DIR/repo"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$REPO_DIR/node_modules" ]; then
  # Fallback: try project dir in clawd
  REPO_DIR="$(find "$HOME" -maxdepth 4 -name "node_modules" -path "*nwc-monitor*" -printf '%h\n' 2>/dev/null | head -1)"
  if [ -z "$REPO_DIR" ]; then
    echo "❌ nwc-monitor not installed. Run: bash $SCRIPT_DIR/install.sh"
    exit 1
  fi
fi

# Copy cli to repo dir for module resolution, run from there
cp "$SCRIPT_DIR/nwc-cli.mjs" "$REPO_DIR/_nwc-cli.mjs"
cd "$REPO_DIR"
exec bun _nwc-cli.mjs "$@"
