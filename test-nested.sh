#!/usr/bin/env bash
set -euo pipefail

UUID="hostctl@dmachard.dev"
TMP_DIR=$(mktemp -d -t gnome-test-XXXXXX)
EXT_DIR="$TMP_DIR/data/gnome-shell/extensions/$UUID"

trap 'rm -rf "$TMP_DIR"' EXIT

echo "[+] Setting up isolated test environment in $TMP_DIR ..."
mkdir -p "$EXT_DIR"
cp *.js metadata.json stylesheet.css "$EXT_DIR/"
cp -r schemas icons "$EXT_DIR/"
glib-compile-schemas "$EXT_DIR/schemas"

echo "[+] Launching isolated nested GNOME Shell..."
echo "[i] Close the window to exit and clean up."

XDG_DATA_HOME="$TMP_DIR/data" \
XDG_CONFIG_HOME="$TMP_DIR/config" \
dbus-run-session bash -c "
    gsettings set org.gnome.shell enabled-extensions \"['$UUID']\"
    exec gnome-shell --devkit --wayland
"

