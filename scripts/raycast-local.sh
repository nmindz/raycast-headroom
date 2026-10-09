#!/bin/sh
# Local install into every Raycast app present (Raycast, Raycast Beta). Usage: install|uninstall|restart.
# Raycast reads ~/.config/raycast/extensions/<name> at launch; Raycast Beta registers via `ray develop`.
set -eu

NAME=headroom
CLASSIC=com.raycast.macos
BETA=com.raycast-x.macos
CLASSIC_DIR="$HOME/.config/raycast/extensions/$NAME"
BETA_DIR="$HOME/.config/raycast-x/extensions/$NAME"

# The Raycast Beta (0.x) CLI line; the project's 2.x CLI has no Raycast Beta target.
BETA_CLI="@raycast/api@latest-v0"

installed() {
  osascript -e "path to application id \"$1\"" >/dev/null 2>&1
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

install_classic() {
  rm -rf "$CLASSIC_DIR"
  npx ray build -e dist -o "$CLASSIC_DIR"
  echo "installed into $CLASSIC_DIR"
  restart_app "$CLASSIC"
}

# Start `ray develop` against Raycast Beta, which registers the extension, then stop it after the first build.
install_beta() {
  log=$(mktemp)

  RAY_Target=x npx -y -p "$BETA_CLI" ray develop >"$log" 2>&1 &
  cli=$!

  # Up to 3 min for the first build.
  for _ in $(seq 900); do
    grep -q 'built extension successfully' "$log" && break
    kill -0 "$cli" 2>/dev/null || break
    sleep 0.2
  done

  built=0
  grep -q 'built extension successfully' "$log" && built=1

  kill -INT "$cli" 2>/dev/null || true
  wait "$cli" 2>/dev/null || true

  if [ "$built" -eq 0 ]; then
    cat "$log" >&2
    rm -f "$log"
    echo "Raycast Beta registration failed." >&2
    exit 1
  fi

  rm -f "$log"
  echo "installed into $BETA_DIR and registered with Raycast Beta"
}

install() {
  found=0

  if installed "$CLASSIC"; then
    found=1
    install_classic
  fi

  if installed "$BETA"; then
    found=1
    install_beta
  fi

  if [ "$found" -eq 0 ]; then
    echo "No Raycast app found (looked for $CLASSIC and $BETA)." >&2
    exit 1
  fi
}

uninstall() {
  for target in "$CLASSIC_DIR" "$BETA_DIR"; do
    if [ -d "$target" ]; then
      rm -rf "$target"
      echo "removed $target"
    fi
  done
}

restart() {
  for id in "$CLASSIC" "$BETA"; do
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
