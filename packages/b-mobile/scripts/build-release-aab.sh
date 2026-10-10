#!/usr/bin/env bash
# Builds the signed Play upload bundle (AAB). See docs/RELEASING-android.md.
set -euo pipefail

cd "$(dirname "$0")/.."

for v in BMOBILE_UPLOAD_STORE_FILE BMOBILE_UPLOAD_STORE_PASSWORD BMOBILE_UPLOAD_KEY_ALIAS BMOBILE_UPLOAD_KEY_PASSWORD; do
  if [ -z "${!v:-}" ]; then
    echo "error: $v is not set (see docs/RELEASING-android.md)" >&2
    exit 1
  fi
done
if [ ! -f android/app/google-services.json ]; then
  echo "error: android/app/google-services.json is missing (gitignored; copy it in from Firebase)" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is not clean; a release build must match a commit" >&2
  exit 1
fi

RELEASE=1 npm run build
npx cap sync android
(cd android && ./gradlew :app:bundleRelease)

aab=android/app/build/outputs/bundle/release/app-release.aab
echo "Built $aab (versionCode $(git rev-list --count HEAD) @ $(git rev-parse --short HEAD))"
jarsigner -verify "$aab" >/dev/null && echo "Signature verified."
