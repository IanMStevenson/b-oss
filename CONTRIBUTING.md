# Contributing to b-oss

## Getting started

1. Clone the repo and run `nvm use && npm run setup`
2. Copy `.env.example` to `.env.local` and set `VITE_BLIPFOTO_CLIENT_ID` to your Blipfoto client ID
   (Register a **distributed app** at https://www.blipfoto.com/developer/apps,
   redirect URI: `b-ark://oauth/callback` — no client secret needed)
3. Run `npm run dev` to start b-ark in development mode

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the package structure and design principles.

## Mac build

Mac builds require a macOS runner — this cannot be cross-compiled. The Mac GitHub Actions
workflow (`.github/workflows/release-mac.yml`) is run manually (**Actions → Release (Mac) →
Run workflow**, selecting the branch to build). It can be triggered from a feature branch
without merging, because the dispatch button only needs the workflow file present on the
default branch.

It is currently an **unsigned test build**: it produces a universal (Apple Silicon + Intel)
DMG and publishes it to its **own separate pre-release tag** (`v1.0.0-mac-test.<run>`),
marked _Pre-release_ so it never appears as _Latest_ and never touches the real `v1.0.0`
release. `package.json` stays at `1.0.0`. Because it is unsigned, testers must bypass
Gatekeeper (right-click → **Open**, or `xattr -dr com.apple.quarantine
/Applications/b-ark.app`) and macOS auto-update does not apply.

Two follow-ups graduate this to production:

1. **Fold into the normal release cycle** — trigger the Mac job on the same `v*` tag as
   Windows so both platforms attach to one versioned release (each platform's auto-updater
   reads its own `latest*.yml`).
2. **Sign + notarize** — a Mac contributor with an Apple Developer Program membership
   supplies a Developer ID certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`) and notarization
   secrets (`APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`), then drop
   `CSC_IDENTITY_AUTO_DISCOVERY` from the workflow.

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
