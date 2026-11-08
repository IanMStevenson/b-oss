# Releasing b-ark-chrome

The zip is built in CI by the same `b-ark-v*` tag that builds the b-ark Store MSIX (workflow
`.github/workflows/release-b-ark.yml`, job `build-chrome`, [b-oss#945](https://github.com/IanMStevenson/b-oss/issues/945)).
Uploading it to the Chrome Web Store dashboard and submitting for review stay manual. This follows the common checklist in the repo-root
[RELEASING.md](../../RELEASING.md#components-and-the-common-checklist); b-ark-chrome shares its
version number and CHANGELOG section with b-ark, so a b-ark release and a b-ark-chrome release
normally happen together.

## One-off setup

- CI: the `VITE_CHROME_CLIENT_ID` secret in the `b-ark-release` Environment (see the root
  [RELEASING.md](../../RELEASING.md#prerequisites-once-per-repo)); the job writes it to `.env.local`.
- Local builds: `VITE_CHROME_CLIENT_ID` in the repo-root `.env.local` (the Blipfoto distributed app registered
  with redirect `bark-chrome://oauth/callback`; see the [README](README.md#prerequisites)). A build
  without it fails outright rather than shipping an extension whose sign-in silently does nothing.
- The signing key `packages/b-ark-chrome/key.pem` (gitignored) only matters for a self-hosted
  `.crx`; the Web Store re-signs uploads. The extension ID is pinned by the `key` in
  `manifest.json` and must not change (see the README's "Signing key & the pinned extension ID").
- Access to the Chrome Web Store developer dashboard for the existing listing.

## Cutting a release

1. **Changelog.** Move `[Unreleased]` into a dated section in the root `CHANGELOG.md`
   (shared with b-ark). This is the internal technical record, never published. Write the user-facing
   note once in `packages/b-site/release-notes/b-ark-chrome.md`: `## <version> - <YYYY-MM-DD>`, newest
   first, then 500 characters or fewer in plain words, saying what the user will see.
2. **Version.** Bump the root `package.json`, `packages/b-ark-chrome/package.json` and the
   `version` in `packages/b-ark-chrome/manifest.json` together. The Web Store rejects an upload
   whose manifest version is not higher than the published one. Step 4 of the root
   [RELEASING.md](../../RELEASING.md#4-bump-versions) lists the full set of version files.
3. **Generated data.** None for this component.
4. **Build and package.** Merge the version bump to `main`, then push the tag `b-ark-v<version>` (it must
   match the three version files above and be on `main`). Download the `b-ark-chrome-zip` artifact from the
   run. To build locally instead, from a clean tree, with `RELEASE=1`:

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
   - Paste that same release note into the Web Store's release notes, wherever the dashboard takes them.
   - If the listing text, permissions or screenshots changed, update them from
     [store/listing.md](store/listing.md) (the source of truth for the dashboard text fields;
     screenshots and the promo tile are in `store/`). Permission changes need a fresh justification
     in the Privacy tab ([chrome-permissions.md](chrome-permissions.md) has the reasoning) and can
     lengthen review.
   - The privacy policy is hosted from `docs/b-ark-chrome-privacy.html` on GitHub Pages; if data
     handling changed, update it first so the URL in the dashboard is true at submission.
   - Submit for review. The `b-ark-v<version>` tag already exists, as it started the build.
7. **Audit.** `npm audit --omit=dev --audit-level=high` clean (or tolerated alerts dismissed on
   GitHub with a reason).

## Notes

- Review time varies, and a new permission or host pattern is the usual cause of
  delay or rejection. Keep permission changes out of releases that don't need them.
- Don't reuse a version number: the dashboard wants each upload's manifest version higher than the
  last. Bump the patch.
- To roll back, publish a new, higher version with the fix; the Web Store has no downgrade.
