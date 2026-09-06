#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson

# Build b-ark's Windows NSIS installer from Linux, with no Wine (or anything
# else) installed on the host. Uses electron-builder's official Wine-bundled
# image (electronuserland/builder:wine) so the whole thing is a disposable
# `docker run --rm` — nothing is left behind on the host or in the image.
#
# This is the Linux-friendly equivalent of RELEASING.md's "Local dry-run
# installer" step (§3), which otherwise assumes PowerShell on Windows.
#
# Usage:
#   ./scripts/build-win-docker.sh [--release]
#
#   --release   Sets RELEASE=1 for the build, so the in-app version is a bare
#               1.0.0 instead of the dev-style 1.0.0.<commits>.<build> (see
#               CLAUDE.md "Versioning"). Use this to match what a real tagged
#               release would produce; omit it for a quick local sanity check.
#
# Output: packages/b-ark/dist-electron/b-ark Setup <version>.exe
#
# Prerequisites: Docker running (rootless is fine), and a repo-root
# .env.local with MAIN_VITE_BLIPFOTO_CLIENT_ID set (see .env.example) — the
# whole repo is bind-mounted into the container, so .env.local just needs to
# exist on disk, same as any local build.
#
# First validated 2026-09-01 (informed PRs #89, #94); this script exists so
# the command doesn't have to be re-discovered from session history again
# (it was, once, on 2026-09-06 — see b-oss#109).

set -euo pipefail
cd "$(dirname "$0")/.."

RELEASE_PREFIX=""
if [[ "${1:-}" == "--release" ]]; then
  RELEASE_PREFIX="RELEASE=1 "
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--release]" >&2
  exit 1
fi

if [[ ! -f .env.local ]]; then
  echo "warning: no .env.local at repo root — MAIN_VITE_BLIPFOTO_CLIENT_ID will be" >&2
  echo "unset, and the installer's OAuth sign-in will silently fail. See .env.example." >&2
fi

docker run --rm \
  -v "$(pwd)":/project \
  -w /project \
  electronuserland/builder:wine \
  bash -c "npm run build --workspace=packages/b-view-backup && cd packages/b-ark && ${RELEASE_PREFIX}npm run dist:win"

echo
echo "Installer:"
ls -la packages/b-ark/dist-electron/*.exe
