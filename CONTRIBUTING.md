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

Mac builds require a macOS runner with Apple code signing — this cannot be cross-compiled.
The Mac GitHub Actions workflow is present but disabled. We are looking for a Mac contributor
to enable, validate, and own the Mac build pipeline. See `.github/workflows/release-mac.yml`.

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
