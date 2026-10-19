#!/usr/bin/env bash
# Builds the Play upload bundle (AAB), UNSIGNED. The upload key never touches this machine: sign
# the bundle on the machine that holds it (scripts/sign-aab.ps1). See docs/RELEASING-android.md.
set -euo pipefail

cd "$(dirname "$0")/.."

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
# Force an unsigned build whatever the environment says: signing happens elsewhere.
(cd android && env -u BMOBILE_UPLOAD_STORE_FILE ./gradlew :app:bundleRelease)

aab=android/app/build/outputs/bundle/release/app-release.aab
echo "Built $aab (UNSIGNED, versionCode $(git rev-list --count HEAD) @ $(git rev-parse --short HEAD))"
echo "Next: sign it with the upload key (scripts/sign-aab.ps1), then upload in the Play Console."
