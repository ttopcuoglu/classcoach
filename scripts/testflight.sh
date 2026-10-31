#!/bin/bash
# Builds Wivoza (iPhone + Apple Watch) and uploads it to TestFlight in one go.
#
#   scripts/testflight.sh                  next build number, same version
#   scripts/testflight.sh --version 1.5.0  next build number, new version
#   scripts/testflight.sh --no-upload      build and sign only, upload nothing
#
# Why it does not just use Xcode's Archive: Xcode signs an archive for
# development first, and Apple only issues development profiles to a team
# with a registered device. This archives unsigned and lets the export sign
# with the App Store distribution certificate, which needs no device.
#
# Archiving unsigned drops the app's entitlements, and the export keeps only
# the entitlements already on the binary — so without the ad-hoc signature
# below, Sign in with Apple silently disappears from the uploaded build. The
# script checks for it before uploading.

set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT=ClassCoach.xcodeproj
PBXPROJ=$PROJECT/project.pbxproj
TEAM_ID=22PX9634Q5
ENTITLEMENTS=ClassCoach/ClassCoach.entitlements

VERSION=""
UPLOAD=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --no-upload) UPLOAD=false; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Both targets carry the build number and version, and App Store Connect
# rejects a watch app that does not match its iPhone app — so they are always
# changed together, never one at a time.
CURRENT=$(grep -m1 -o 'CURRENT_PROJECT_VERSION = [0-9]*' "$PBXPROJ" | grep -o '[0-9]*$')
BUILD=$((CURRENT + 1))
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $BUILD;/" "$PBXPROJ"
if [[ -n "$VERSION" ]]; then
  sed -i '' "s/MARKETING_VERSION = [0-9.]*;/MARKETING_VERSION = $VERSION;/" "$PBXPROJ"
fi
VERSION=$(grep -m1 -o 'MARKETING_VERSION = [0-9.]*' "$PBXPROJ" | grep -o '[0-9.]*$')
echo "Building Wivoza $VERSION ($BUILD)…"

ARCHIVE=build/ClassCoach-$BUILD.xcarchive
EXPORT=build/export-$BUILD
rm -rf "$ARCHIVE" "$EXPORT"
mkdir -p build

LOG=build/testflight-$BUILD.log
if ! xcodebuild -project "$PROJECT" -scheme ClassCoach -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
    CODE_SIGNING_ALLOWED=NO archive > "$LOG" 2>&1; then
  grep -E "error:" "$LOG" | sort -u | head -20 >&2
  echo "Archive failed. Full log: $LOG" >&2
  exit 1
fi

APP="$ARCHIVE/Products/Applications/ClassCoach.app"
codesign -f -s - --entitlements "$ENTITLEMENTS" "$APP"

OPTIONS=build/export-options.plist
cat > "$OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>export</string>
<key>signingStyle</key><string>automatic</string>
<key>teamID</key><string>$TEAM_ID</string>
</dict></plist>
EOF

# Export to a file first, even when uploading, so the signed result can be
# checked before anything leaves this Mac.
if ! xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT" \
    -exportOptionsPlist "$OPTIONS" -allowProvisioningUpdates >> "$LOG" 2>&1; then
  grep -E "error:" "$LOG" | sort -u | head -20 >&2
  echo "Signing failed. Full log: $LOG" >&2
  exit 1
fi

CHECK=$(mktemp -d)
unzip -q "$EXPORT/ClassCoach.ipa" -d "$CHECK"
if ! codesign -d --entitlements - --xml "$CHECK/Payload/ClassCoach.app" 2>/dev/null | grep -q applesignin; then
  echo "Stopped: the signed app lost Sign in with Apple. Nothing was uploaded." >&2
  exit 1
fi
if [[ ! -d "$CHECK/Payload/ClassCoach.app/Watch/WivozaWatch.app" ]]; then
  echo "Stopped: the Apple Watch app is missing from the build. Nothing was uploaded." >&2
  exit 1
fi
rm -rf "$CHECK"
echo "Signed and checked: $EXPORT/ClassCoach.ipa"

if ! $UPLOAD; then
  echo "Not uploaded (--no-upload)."
  exit 0
fi

# Uses the Apple account signed in to Xcode, so there is no password or API
# key to keep here.
UPLOAD_OPTIONS=build/upload-options.plist
sed 's|<string>export</string>|<string>upload</string>|' "$OPTIONS" > "$UPLOAD_OPTIONS"
if ! xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT-upload" \
    -exportOptionsPlist "$UPLOAD_OPTIONS" -allowProvisioningUpdates >> "$LOG" 2>&1; then
  grep -E "error:" "$LOG" | sort -u | tail -10 >&2
  echo "Upload failed. Full log: $LOG" >&2
  exit 1
fi

echo "Uploaded Wivoza $VERSION ($BUILD) to TestFlight. Apple takes 10–30 minutes to process it."
echo "Commit the build number with: git commit -m \"iPhone: build $BUILD\" $PBXPROJ"
