# Releasing b-ark-chrome

Release is manual: build a zip, upload it to the Chrome Web Store dashboard, submit for review.
There is no release workflow. This follows the common checklist in the repo-root
[RELEASING.md](../../RELEASING.md#components-and-the-common-checklist); b-ark-chrome shares its
version number and CHANGELOG section with b-ark, so a b-ark release and a b-ark-chrome release
normally happen together.

## One-off setup

- `VITE_CHROME_CLIENT_ID` in the repo-root `.env.local` (the Blipfoto distributed app registered
  with redirect `bark-chrome://oauth/callback`; see the [README](README.md#prerequisites)). A build
  without it fails outright rather than shipping an extension whose sign-in silently does nothing.
- The signing key `packages/b-ark-chrome/key.pem` (gitignored) only matters for a self-hosted
  `.crx`; the Web Store re-signs uploads. The extension ID is pinned by the `key` in
  `manifest.json` and must not change (see the README's "Signing key & the pinned extension ID").
- Access to the Chrome Web Store developer dashboard for the existing listing.

## Cutting a release

1. **Changelog.** Move `[Unreleased]` into a dated section in the root `CHANGELOG.md`
   (user-facing entries; shared with b-ark).
2. **Version.** Bump the root `package.json`, `packages/b-ark-chrome/package.json` and the
   `version` in `packages/b-ark-chrome/manifest.json` together. The Web Store rejects an upload
   whose manifest version is not higher than the published one. Step 4 of the root
   [RELEASING.md](../../RELEASING.md#4-bump-versions) lists the full set of version files.
3. **Generated data.** None for this component.
4. **Build and package from a clean tree, with `RELEASE=1`:**

   ```bash
   RELEASE=1 npm run dist --workspace=@b-oss/b-ark-chrome
   ```

   This builds `b-view-backup`, copies it in, runs `vite build` and writes
   `packages/b-ark-chrome/b-ark-chrome-<version>.zip`. Unzip it or load `dist/` unpacked and check
   the version on the extension's settings screen is the bare version, not a dev-style
   `1.0.5.<commits>.<build>`.

5. **Smoke test on a clean Chrome profile** (Load unpacked from `dist/`, or install from the zip):
   sign in to Blipfoto, choose a folder, run a small backup, check the chip goes green and the
   `entries/YYYY/…` files appear. Sign-in is the part a bad build breaks quietly.
6. **Publish.**
   - Dashboard → the b-ark-chrome item → Package → upload the zip.
   - If the listing text, permissions or screenshots changed, update them from
     [store/listing.md](store/listing.md) (the source of truth for the dashboard text fields;
     screenshots and the promo tile are in `store/`). Permission changes need a fresh justification
     in the Privacy tab ([chrome-permissions.md](chrome-permissions.md) has the reasoning) and can
     lengthen review.
   - The privacy policy is hosted from `docs/b-ark-chrome-privacy.html` on GitHub Pages; if data
     handling changed, update it first so the URL in the dashboard is true at submission.
   - Submit for review. Tag the same `v<version>` as the b-ark release if they ship together.
7. **Audit.** `npm audit --omit=dev --audit-level=high` clean (or tolerated alerts dismissed on
   GitHub with a reason).

## Notes

- Review can take from hours to days, and a new permission or host pattern is the usual cause of
  delay or rejection. Keep permission changes out of releases that don't need them.
- Never reuse a version number: once uploaded, even a rejected or unpublished version number is
  spent in the dashboard. Bump the patch.
- To roll back, publish a new, higher version with the fix; the Web Store has no downgrade.
