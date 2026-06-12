#!/usr/bin/env bash
#
# Generate packages/b-ark/resources/icon.icns for the macOS build.
#
# macOS-only: uses the built-in `sips` and `iconutil` tools. Driven entirely from
# the 1024x1024 master PNG so the result is deterministic and doesn't depend on the
# partial set of @2x sources committed in icon.iconset/.
#
# Run from CI (release-mac.yml) or locally on a Mac before `electron-builder --mac`.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
resources="$repo_root/packages/b-ark/resources"
master="$resources/icon.iconset/icon_512x512@2x.png"   # 1024x1024 master
out="$resources/icon.icns"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "make-icns.sh requires macOS (sips/iconutil). Current OS: $(uname)" >&2
  exit 1
fi

if [[ ! -f "$master" ]]; then
  echo "Master icon not found: $master" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
set="$work/icon.iconset"
mkdir -p "$set"

# Apple's required iconset members: each logical size at 1x and @2x.
# size : output filename
gen() { sips -z "$1" "$1" "$master" --out "$set/$2" >/dev/null; }

gen 16   icon_16x16.png
gen 32   icon_16x16@2x.png
gen 32   icon_32x32.png
gen 64   icon_32x32@2x.png
gen 128  icon_128x128.png
gen 256  icon_128x128@2x.png
gen 256  icon_256x256.png
gen 512  icon_256x256@2x.png
gen 512  icon_512x512.png
gen 1024 icon_512x512@2x.png

iconutil -c icns "$set" -o "$out"
echo "Wrote $out"
