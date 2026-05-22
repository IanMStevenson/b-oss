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

## Licence

By contributing you agree your contributions are licensed under GPLv3.
