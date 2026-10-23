#!/usr/bin/env bash
# Builds the Play upload bundle (AAB).
#
#   build-release-aab.sh          UNSIGNED. For local checks; the upload key is never needed here.
#   build-release-aab.sh --sign   Signs with the upload key from BMOBILE_UPLOAD_* (see below).
#                                 Used only by .github/workflows/release-android.yml, where the key
#                                 exists as a protected Environment secret.
#
# See docs/RELEASING-android.md.
set -euo pipefail

cd "$(dirname "$0")/.."

sign=0
case "${1:-}" in
  '') ;;
  --sign) sign=1 ;;
  *) echo "usage: $0 [--sign]" >&2; exit 2 ;;
esac

if [ "$sign" = 1 ]; then
  for v in BMOBILE_UPLOAD_STORE_FILE BMOBILE_UPLOAD_STORE_PASSWORD BMOBILE_UPLOAD_KEY_ALIAS BMOBILE_UPLOAD_KEY_PASSWORD; do
    if [ -z "${!v:-}" ]; then
      echo "error: $v is not set" >&2
      exit 1
    fi
  done
fi
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
if [ "$sign" = 1 ]; then
  (cd android && ./gradlew :app:bundleRelease)
else
  # Force an unsigned build whatever the environment says.
  (cd android && env -u BMOBILE_UPLOAD_STORE_FILE ./gradlew :app:bundleRelease)
fi

aab=android/app/build/outputs/bundle/release/app-release.aab
state=UNSIGNED
if [ "$sign" = 1 ]; then
  jarsigner -verify "$aab" >/dev/null || { echo "error: signature did not verify" >&2; exit 1; }
  state=signed
fi
# Same rule as android/app/build.gradle: the override if set, else commit count + 1000.
version_code="${BMOBILE_VERSION_CODE:-$(($(git rev-list --count HEAD) + 1000))}"
echo "Built $aab ($state, versionCode $version_code @ $(git rev-parse --short HEAD))"
