#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_NAME="FinancialApp"
VERSION="$(node -p "require('./package.json').version")"
ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
  BUILDER_ARCH="arm64"
else
  BUILDER_ARCH="x64"
fi

APP_PATH="release/mac-${BUILDER_ARCH}/${APP_NAME}.app"
BETA_DIR="release/private-beta"
ZIP_PATH="${BETA_DIR}/${APP_NAME}-${VERSION}-mac-${BUILDER_ARCH}-private-beta.zip"
NOTES_PATH="${BETA_DIR}/INSTALL-MAC-BETA.txt"

echo "Building ${APP_NAME} ${VERSION} private macOS beta (${BUILDER_ARCH})..."

npm run build

FINANCIALAPP_DISABLE_UPDATES=1 CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir "--${BUILDER_ARCH}" --publish never

if [[ ! -d "$APP_PATH" ]]; then
  echo "App bundle not found at ${APP_PATH}" >&2
  exit 1
fi

touch "$APP_PATH/Contents/Resources/private-beta"

echo "Removing local extended attributes..."
xattr -cr "$APP_PATH" || true

echo "Applying ad-hoc signature..."
codesign --force --deep --sign - --timestamp=none "$APP_PATH"

echo "Verifying ad-hoc signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

mkdir -p "$BETA_DIR"
rm -f "$ZIP_PATH"

echo "Creating ZIP..."
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

cat > "$NOTES_PATH" <<'NOTES'
FinancialApp macOS private beta

This build is not Apple-notarized. Only share it with trusted testers.

Install:
1. Unzip the file.
2. Drag FinancialApp.app to Applications.
3. Try to open it.

If macOS blocks it:
1. Open System Settings.
2. Go to Privacy & Security.
3. Scroll down and click Open Anyway for FinancialApp.

If macOS says the app is damaged/corrupted, run this Terminal command:

  xattr -dr com.apple.quarantine /Applications/FinancialApp.app

Then open the app again.

User data is stored outside the app bundle, in Application Support.
Deleting or replacing the app does not delete the user's database.
NOTES

echo
echo "Private beta created:"
echo "  ${ZIP_PATH}"
echo "  ${NOTES_PATH}"
