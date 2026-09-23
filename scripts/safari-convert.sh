#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "dist/safari/manifest.json" ]; then
  echo "dist/safari/manifest.json not found. Run 'npm run build:safari' first." >&2
  exit 1
fi

xcrun safari-web-extension-converter dist/safari \
  --project-location build/safari \
  --app-name Fishy \
  --bundle-identifier dev.lucasavila.fishy \
  --macos-only \
  --no-open \
  --copy-resources \
  --force

echo ""
echo "Next steps:"
echo "1. Open build/safari/Fishy/Fishy.xcodeproj and run the app once."
echo "2. If Safari's Develop menu isn't visible, enable it in Safari > Settings > Advanced."
echo "3. In Safari's Develop menu, turn on 'Allow Unsigned Extensions' (required before Fishy can be enabled)."
echo "4. In Safari > Settings > Extensions, enable Fishy."
