# Releasing b-ark

## Prerequisites

- GitHub Secrets configured: `BLIPFOTO_CLIENT_ID`, `GH_TOKEN` (automatic)
- Code signing cert in Secrets: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (before public release)

## Steps

1. Update `CHANGELOG.md` — move items from Unreleased to a new version section
2. Bump version: `npm version patch|minor|major` at repo root
3. Push: `git push && git push --tags`
4. GitHub Actions `release-win.yml` triggers on the `v*` tag:
   - Builds all packages
   - Runs `electron-builder` targeting Windows
   - Uploads the installer + `latest.yml` manifest to a GitHub Release draft
5. Go to the GitHub Releases page, review the draft, add release notes, publish
6. Existing b-ark installs will detect the new version on next launch via `electron-updater`

## Recovering from a bad release

1. Delete the GitHub Release draft (Releases → Edit → Delete)
2. Delete the tag: `git tag -d vX.Y.Z && git push origin :vX.Y.Z`
3. Fix the issue, re-tag, re-push
