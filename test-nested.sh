#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

UUID="hostctl-test@dmachard.dev"
TMP_DIR=$(mktemp -d -t gnome-test-XXXXXX)
EXT_DIR="$TMP_DIR/.local/share/gnome-shell/extensions/$UUID"

# Cleanup temporary folder on exit
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[+] Setting up isolated test environment in $TMP_DIR ..."
mkdir -p "$EXT_DIR/schemas" "$TMP_DIR/.config"

# Copy extension files with isolated test UUID so host version is never picked up
cp *.js metadata.json stylesheet.css "$EXT_DIR/"
sed -i "s/hostctl@dmachard.dev/$UUID/" "$EXT_DIR/metadata.json"
cp -r icons "$EXT_DIR/"
cp schemas/*.gschema.xml "$EXT_DIR/schemas/"

# Compile GSettings schemas in test directory
echo "[+] Compiling GSettings schemas..."
glib-compile-schemas "$EXT_DIR/schemas/"

echo "[+] Launching isolated nested GNOME Shell..."
echo "[i] Close the window to exit and clean up."

# Clear snap-injected GLib/GTK/GDK overrides (e.g. when launched from VS Code snap)
unset GSETTINGS_SCHEMA_DIR GIO_MODULE_DIR GTK_PATH GTK_EXE_PREFIX \
      GTK_IM_MODULE_FILE GDK_PIXBUF_MODULE_FILE GDK_PIXBUF_MODULEDIR LOCPATH

# Run nested GNOME Shell with isolated HOME/XDG and extension pre-enabled
HOME="$TMP_DIR" \
GNOME_SHELL_SESSION_MODE=user \
XDG_DATA_HOME="$TMP_DIR/.local/share" \
XDG_CONFIG_HOME="$TMP_DIR/.config" \
XDG_DATA_DIRS="/usr/local/share:/usr/share" \
dbus-run-session bash -c "
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell enabled-extensions \"['$UUID']\"
    exec gnome-shell --devkit --wayland --mode=user
"
