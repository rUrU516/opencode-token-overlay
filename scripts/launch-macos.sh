#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
APP="$ROOT/node_modules/electron/dist/Electron.app"
EXECUTABLE="$APP/Contents/MacOS/Electron"
SERVICE="gui/$(id -u)/com.ruru.opencode-token-overlay"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: opencode-token-overlay currently supports macOS only." >&2
  exit 1
fi

if [[ ! -x "$EXECUTABLE" ]]; then
  echo "Error: Electron is not installed. Run 'npm ci' first." >&2
  exit 1
fi

if launchctl print "$SERVICE" >/dev/null 2>&1; then
  echo "OpenCode Token Overlay is managed by launchd. Use 'npm run service:status' or 'npm run service:restart'."
  exit 0
fi

if ps -axo command= | grep -F -- "$EXECUTABLE $ROOT" | grep -v grep >/dev/null; then
  echo "OpenCode Token Overlay is already running."
  exit 0
fi

open -g -n "$APP" --args "$ROOT"
echo "OpenCode Token Overlay launched in the background."
