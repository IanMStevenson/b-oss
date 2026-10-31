#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson

# Builds b-mobile-pc's Windows installer and portable exe on Linux, with no Wine on the host: the same
# electron-builder Wine image b-ark's scripts/build-win-docker.sh uses, in a disposable container.
#
#   packages/b-mobile-pc/scripts/build-win-docker.sh [--asar]
#
# By default this is a dev/preview build: the app's own code is shipped as loose files in
# resources/app/ instead of one resources/app.asar, so a running instance does not lock the file that
# changes on every build and a synced folder can replace it (b-oss#696). --asar (or BMPC_ASAR=1) packs
# the asar, as a release build should (#612 decides how releases are built).
#
# Output (in packages/b-mobile-pc/dist-electron/):
#   b-mobile-Setup-<version>.exe       one-click installer (per user, no admin needed)
#   b-mobile-<version>-portable.exe    single file, no install: just run it
# Unsigned: Windows SmartScreen will warn ("More info" > "Run anyway"). Signing and auto-update are
# b-oss#612. Needs a repo-root .env.local with VITE_BLIPFOTO_CLIENT_ID (see .env.example): it is baked
# into the web build, and without it sign-in does nothing.

set -euo pipefail
cd "$(dirname "$0")/../../.."

asar="${BMPC_ASAR:-0}"
[[ "${1:-}" == "--asar" ]] && asar=1
dist_script=dist:win:dev
[[ "$asar" == "1" ]] && dist_script=dist:win

if [[ ! -f .env.local ]]; then
  echo "warning: no .env.local at the repo root: the web build will have no Blipfoto client id" >&2
fi

mkdir -p "$HOME/.cache/electron" "$HOME/.cache/electron-builder"
proxy_args=()
for v in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy; do
  [ -n "${!v:-}" ] && proxy_args+=(-e "$v=${!v}")
done

docker run --rm --network host "${proxy_args[@]}" \
  -v "$(pwd)":/project \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  -w /project \
  electronuserland/builder:wine \
  bash -c "npm run build -w @b-oss/b-mobile && cd packages/b-mobile-pc && npm run $dist_script"

echo
echo "Built:"
ls -la packages/b-mobile-pc/dist-electron/*.exe
