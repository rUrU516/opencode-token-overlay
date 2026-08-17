#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
EXECUTABLE="$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
PIDS="$(ps -axo pid=,command= | awk -v target="$EXECUTABLE $ROOT" '{ pid=$1; sub(/^[^ ]+[ ]+/, "", $0); if ($0 == target) print pid }')"

if [[ -z "$PIDS" ]]; then
  echo "OpenCode Token Overlay is not running."
  exit 0
fi

kill $PIDS

for _ in {1..30}; do
  if ! ps -p $PIDS >/dev/null 2>&1; then
    echo "OpenCode Token Overlay stopped."
    exit 0
  fi
  sleep .1
done

kill -9 $PIDS 2>/dev/null || true
echo "OpenCode Token Overlay stopped."
