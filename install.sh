#!/usr/bin/env bash
set -euo pipefail

# Script to install the hostctl GNOME Shell extension

cd "$(dirname "$0")"

UUID="hostctl@dmachard.dev"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Install hostctl GNOME Shell extension"

# Create installation directories
mkdir -p "$INSTALL_DIR/schemas"

# Copy files
echo "Copying files to $INSTALL_DIR ..."
cp extension.js "$INSTALL_DIR/"
cp prefs.js "$INSTALL_DIR/"
cp vmPanel.js "$INSTALL_DIR/"
cp virshClient.js "$INSTALL_DIR/"
cp containerClient.js "$INSTALL_DIR/"
cp sshClient.js "$INSTALL_DIR/"
cp exec.js "$INSTALL_DIR/"
cp metadata.json "$INSTALL_DIR/"
cp stylesheet.css "$INSTALL_DIR/"
cp -r icons "$INSTALL_DIR/"

# Copy GSettings schemas
cp schemas/*.gschema.xml "$INSTALL_DIR/schemas/"

# Compile GSettings schemas
echo "Generating GSettings schemas ..."
glib-compile-schemas "$INSTALL_DIR/schemas/"

echo "Installation completed successfully!"
echo ""
echo "To activate the extension:"
echo "  1. Restart GNOME Shell (Alt+F2, then 'r' on X11) or log out and back in on Wayland"
echo "  2. Activate the extension with: gnome-extensions enable $UUID"
echo ""
echo "To open settings:"
echo "  gnome-extensions prefs $UUID"

