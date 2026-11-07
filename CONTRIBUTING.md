# Contributing to b-oss

New here? The [contributor guide](docs/CONTRIBUTOR-GUIDE.md) takes you from a PC with Claude Code to a
merged pull request, and explains how this project is run. This page is the short version.

## Getting started

1. Clone the repo and run `nvm use && npm run setup`
2. Copy `.env.example` to `.env.local` and set `VITE_BLIPFOTO_CLIENT_ID` to your Blipfoto client ID
   (Register a **distributed app** at https://www.blipfoto.com/developer/apps,
   redirect URI: `b-ark://oauth/callback` — no client secret needed)
3. Run `npm run dev --workspace=packages/b-ark` to start b-ark in development mode

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the package structure and design principles.

## Mac build

Mac builds require a macOS runner — this cannot be cross-compiled — and there is currently no Mac
workflow or release: the earlier unsigned test workflow was removed ([b-oss#945](https://github.com/IanMStevenson/b-oss/issues/945)).
A Mac contributor would need to add a workflow that builds a universal (Apple Silicon + Intel) DMG with
electron-builder and signs and notarizes it (a Developer ID certificate, `CSC_LINK` / `CSC_KEY_PASSWORD`, and
`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`), using a GitHub Environment for the secrets as
the other release workflows do. `scripts/make-icns.sh` (macOS only) generates the `.icns` icon.

## Code style

- TypeScript strict mode everywhere — no `any`
- Run `npm run typecheck && npm run lint` before submitting a PR
- All names lowercase hyphenated: b-ark, b-view, b-oss

## Contributions

Contributions are accepted via pull request. Please run `npm run typecheck && npm run lint`
before submitting.

## Contributor Licence Agreement

Before your pull request can be merged, you must agree to the
[Contributor Licence Agreement](CLA.md). The CLA Assistant bot will prompt you
to sign when you open a PR. You can sign by posting the following comment:

> I have read the CLA Document and I hereby sign the CLA

## Licence

This project is licensed under the GNU General Public Licence v3.0 or later (GPL-3.0-or-later).
All contributions are made under that licence in accordance with the CLA.
