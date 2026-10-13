#!/bin/sh
# Local install into every Raycast app present (Raycast 2, Raycast 1, Raycast Beta). Usage: install|uninstall|restart.
# Raycast 2 and Raycast Beta register a local extension only through the `ray develop` handshake; Raycast 1 reads
# ~/.config/raycast/extensions/<name> at launch.
set -eu

# `ray` and `pnpm` act on the current directory: run from the project root wherever the script is called from.
cd -- "$(dirname -- "$0")/.."

NAME=headroom
RETAIL=com.raycast.macos
BETA=com.raycast-x.macos
RETAIL_DIR="$HOME/.config/raycast/extensions/$NAME"
BETA_DIR="$HOME/.config/raycast-x/extensions/$NAME"

# The Raycast Beta (0.x) CLI line; the project's 2.x CLI targets com.raycast.macos only.
BETA_CLI="@raycast/api@latest-v0"

installed() {
  osascript -e "path to application id \"$1\"" >/dev/null 2>&1
}

app_version() {
  app=$(osascript -e "POSIX path of (path to application id \"$1\")")
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${app%/}/Contents/Info.plist"
}

running() {
  [ -n "$(lsappinfo find "bundleid=$1")" ]
}

restart_app() {
  if ! running "$1"; then
    echo "$1 is not running; it picks up the extension on next launch."
    return
  fi

  echo "Restarting $1 so it re-indexes local extensions"

  # Raycast Beta answers the quit event with "User canceled" (-128) and exits anyway; the loop decides.
  osascript -e "quit app id \"$1\"" >/dev/null 2>&1 || true

  # Up to 10 s for it to exit.
  for _ in $(seq 50); do
    running "$1" || break
    sleep 0.2
  done

  if running "$1"; then
    echo "$1 did not quit; restart it manually." >&2
    exit 1
  fi

  open -b "$1"
}

# Raycast 1: build into the folder it scans at launch, then restart it.
install_folder() {
  rm -rf "$RETAIL_DIR"
  pnpm exec ray build -e dist -o "$RETAIL_DIR"
  echo "installed into $RETAIL_DIR"
  restart_app "$RETAIL"
}

# Usage: install_develop <label> <dir> <command…>. Runs `ray develop`, whose first build registers the extension with
# the app (launching it if needed), then stops the session; the extension stays installed. No restart needed.
install_develop() {
  label=$1
  dir=$2
  shift 2
  log=$(mktemp)

  # Own process group: pnpm does not forward SIGINT to `ray develop`, so the whole group is signalled.
  set -m
  "$@" >"$log" 2>&1 &
  cli=$!
  set +m

  # Up to 3 min for the first build.
  for _ in $(seq 900); do
    grep -q 'built extension successfully' "$log" && break
    kill -0 "$cli" 2>/dev/null || break
    sleep 0.2
  done

  built=0
  grep -q 'built extension successfully' "$log" && built=1

  kill -INT -- "-$cli" 2>/dev/null || true
  wait "$cli" 2>/dev/null || true

  if [ "$built" -eq 0 ]; then
    cat "$log" >&2
    rm -f "$log"
    echo "$label registration failed." >&2
    exit 1
  fi

  rm -f "$log"
  echo "installed into $dir and registered with $label"
}

install() {
  found=0

  if installed "$RETAIL"; then
    found=1
    version=$(app_version "$RETAIL")
    if [ "${version%%.*}" -ge 2 ]; then
      install_develop "Raycast $version" "$RETAIL_DIR" pnpm exec ray develop
    else
      install_folder
    fi
  fi

  if installed "$BETA"; then
    found=1
    install_develop "Raycast Beta" "$BETA_DIR" env RAY_Target=x pnpm dlx --package="$BETA_CLI" ray develop
  fi

  if [ "$found" -eq 0 ]; then
    echo "No Raycast app found (looked for $RETAIL and $BETA)." >&2
    exit 1
  fi
}

uninstall() {
  for target in "$RETAIL_DIR" "$BETA_DIR"; do
    if [ -d "$target" ]; then
      rm -rf "$target"
      echo "removed $target"
    fi
  done
}

restart() {
  for id in "$RETAIL" "$BETA"; do
    installed "$id" && restart_app "$id"
  done

  return 0
}

case "${1:-}" in
  install | uninstall | restart) "$1" ;;
  *)
    echo "usage: $0 install|uninstall|restart" >&2
    exit 2
    ;;
esac
