#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
EXECUTABLE="$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
LABEL="com.ruru.opencode-token-overlay"
DOMAIN="gui/$(id -u)"
SERVICE="$DOMAIN/$LABEL"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/OpenCodeTokenOverlay"
STDOUT_LOG="$LOG_DIR/overlay.log"
STDERR_LOG="$LOG_DIR/overlay-error.log"
ACTION="${1:-status}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: launchd installation is available on macOS only." >&2
  exit 1
fi

is_loaded() {
  launchctl print "$SERVICE" >/dev/null 2>&1
}

require_electron() {
  if [[ ! -x "$EXECUTABLE" ]]; then
    echo "Error: Electron is not installed. Run 'npm ci' first." >&2
    exit 1
  fi
}

write_plist() {
  mkdir -p "$(dirname "$PLIST")" "$LOG_DIR"
  plutil -create xml1 "$PLIST"
  plutil -insert Label -string "$LABEL" "$PLIST"
  plutil -insert ProgramArguments -array "$PLIST"
  plutil -insert ProgramArguments.0 -string "$EXECUTABLE" "$PLIST"
  plutil -insert ProgramArguments.1 -string "$ROOT" "$PLIST"
  plutil -insert WorkingDirectory -string "$ROOT" "$PLIST"
  plutil -insert RunAtLoad -bool true "$PLIST"
  plutil -insert KeepAlive -bool true "$PLIST"
  plutil -insert ThrottleInterval -integer 5 "$PLIST"
  plutil -insert ProcessType -string Interactive "$PLIST"
  plutil -insert StandardOutPath -string "$STDOUT_LOG" "$PLIST"
  plutil -insert StandardErrorPath -string "$STDERR_LOG" "$PLIST"
  plutil -lint "$PLIST" >/dev/null
}

print_status() {
  echo "LaunchAgent: $PLIST"
  echo "Logs:        $LOG_DIR"
  if ! is_loaded; then
    if [[ -f "$PLIST" ]]; then
      echo "Status:      installed, not loaded"
    else
      echo "Status:      not installed"
    fi
    return 0
  fi
  local details state pid
  details="$(launchctl print "$SERVICE")"
  state="$(printf '%s\n' "$details" | awk -F'= ' '/^[[:space:]]*state = / { print $2; exit }')"
  pid="$(printf '%s\n' "$details" | awk -F'= ' '/^[[:space:]]*pid = / { print $2; exit }')"
  echo "Status:      ${state:-loaded}"
  [[ -n "$pid" ]] && echo "PID:         $pid"
}

case "$ACTION" in
  install)
    require_electron
    if is_loaded; then launchctl bootout "$SERVICE"; fi
    bash "$ROOT/scripts/stop-macos.sh" >/dev/null || true
    write_plist
    launchctl bootstrap "$DOMAIN" "$PLIST"
    launchctl enable "$SERVICE"
    launchctl kickstart -k "$SERVICE"
    sleep .5
    echo "OpenCode Token Overlay LaunchAgent installed."
    print_status
    ;;
  uninstall)
    if is_loaded; then launchctl bootout "$SERVICE"; fi
    rm -f "$PLIST"
    echo "OpenCode Token Overlay LaunchAgent uninstalled."
    ;;
  start)
    require_electron
    if [[ ! -f "$PLIST" ]]; then
      echo "Error: LaunchAgent is not installed. Run 'npm run service:install' first." >&2
      exit 1
    fi
    if ! is_loaded; then launchctl bootstrap "$DOMAIN" "$PLIST"; fi
    launchctl enable "$SERVICE"
    launchctl kickstart -k "$SERVICE"
    sleep .5
    print_status
    ;;
  stop)
    if is_loaded; then
      launchctl bootout "$SERVICE"
      echo "OpenCode Token Overlay LaunchAgent stopped for this login session."
    else
      echo "OpenCode Token Overlay LaunchAgent is not loaded."
    fi
    ;;
  restart)
    require_electron
    if is_loaded; then
      launchctl kickstart -k "$SERVICE"
    elif [[ -f "$PLIST" ]]; then
      launchctl bootstrap "$DOMAIN" "$PLIST"
    else
      echo "Error: LaunchAgent is not installed. Run 'npm run service:install' first." >&2
      exit 1
    fi
    sleep .5
    print_status
    ;;
  status)
    print_status
    ;;
  logs)
    mkdir -p "$LOG_DIR"
    touch "$STDOUT_LOG" "$STDERR_LOG"
    echo "Following logs. Press Ctrl-C to stop."
    tail -n 100 -F "$STDOUT_LOG" "$STDERR_LOG"
    ;;
  *)
    echo "Usage: $0 {install|uninstall|start|stop|restart|status|logs}" >&2
    exit 2
    ;;
esac
