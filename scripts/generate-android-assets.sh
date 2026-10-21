#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson
#
# Regenerate b-mobile's Android launcher icon, adaptive icon layers, and splash screens from the
# master 1024x1024 PNG (assets/icons/icon.iconset/icon_512x512@2x.png), via @capacitor/assets.
#
# Unlike scripts/copy-icons.mjs (which only copies files and runs on every build), this is a
# manual, occasional step — app-architecture.md §17 requires android/ be checked into the repo,
# not generated at build time, so the generated res/mipmap-*/res/drawable-* files this writes are
# committed like any other source. Re-run only when the master icon changes.
#
# @capacitor/assets is fetched on demand via npx (like scripts/make-icns.sh's use of macOS-only
# system tools) rather than added as a project dependency — it pulls in a large, somewhat dated
# tree (image processing, changelog generation) that has no reason to sit in package-lock.json
# for every other contributor and CI run.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
master="$repo_root/assets/icons/icon.iconset/icon_512x512@2x.png"
b_mobile="$repo_root/packages/b-mobile"

if [[ ! -f "$master" ]]; then
  echo "Master icon not found: $master" >&2
  exit 1
fi

if [[ ! -d "$b_mobile/android" ]]; then
  echo "$b_mobile/android not found — run 'npx cap add android' from packages/b-mobile first." >&2
  exit 1
fi

mkdir -p "$b_mobile/assets"
cp "$master" "$b_mobile/assets/icon.png"

# Brand green (assets/icons/README.md's design tokens) for both the adaptive-icon background
# layer and the splash background — otherwise @capacitor/assets defaults to plain white, which
# doesn't match the green-background mark used everywhere else (icon.ico, icon.icns, tray icons).
cd "$b_mobile"
npx --yes @capacitor/assets@3.0.5 generate --android \
  --iconBackgroundColor '#1f4d3a' \
  --iconBackgroundColorDark '#1f4d3a' \
  --splashBackgroundColor '#1f4d3a' \
  --splashBackgroundColorDark '#0f2e21'

echo "[generate-android-assets] wrote android/app/src/main/res/{mipmap,drawable}-* from $master"
