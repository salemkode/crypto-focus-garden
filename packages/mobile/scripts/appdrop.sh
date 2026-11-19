#!/bin/sh
# Builds an AppDrop .ipa of the iOS app and publishes it as an update to the existing link.
#
# AppDrop re-signs the app on each recipient's iPhone (Tuft, with their own Apple ID). An unsigned
# build carries no entitlements, so the re-signed app would lose Screen Time (Family Controls).
# The bundles are therefore ad-hoc signed with the entitlements they need, which the re-signer
# reads and requests for the recipient's own team.
#
# Usage: scripts/appdrop.sh <build number> [--force]
set -eu
BUILD=${1:?build number (CFBundleVersion), higher than the last upload}
shift
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LINK=https://appdrop.app/d/prvhsh4gyx
OUT=$ROOT/build-appdrop
WORK=$(mktemp -d)

/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" "$ROOT/ios/FocusGarden/Info.plist"
(cd "$ROOT/ios" && xcodebuild -workspace FocusGarden.xcworkspace -scheme FocusGarden -configuration Release \
  -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath "$OUT" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  COMPILER_INDEX_STORE_ENABLE=NO CURRENT_PROJECT_VERSION="$BUILD" -quiet)

mkdir -p "$WORK/Payload"
cp -R "$OUT/Build/Products/Release-iphoneos/FocusGarden.app" "$WORK/Payload/"
APP=$WORK/Payload/FocusGarden.app
cat > "$WORK/screen-time.entitlements" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.developer.family-controls</key><true/></dict></plist>
PLIST
# Inside out: frameworks, then the Device Activity extension, then the app.
find "$APP/Frameworks" -maxdepth 1 \( -name '*.framework' -o -name '*.dylib' \) -exec codesign --force --sign - {} \; 2>/dev/null || true
for EXT in "$APP"/PlugIns/*.appex; do
  [ -e "$EXT" ] && codesign --force --sign - --entitlements "$WORK/screen-time.entitlements" "$EXT"
done
codesign --force --sign - --entitlements "$WORK/screen-time.entitlements" "$APP"
codesign -d --entitlements - "$APP" 2>/dev/null | grep -q family-controls

(cd "$WORK" && zip -qry FocusGarden.ipa Payload)
npx -y appdrop@0.9.0 "$WORK/FocusGarden.ipa" --update "$LINK" "$@"
