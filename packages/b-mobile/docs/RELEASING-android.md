# Releasing b-mobile to Google Play

Release is manual. Publisher: Salient Point (Play developer account). Application ID
`uk.co.salientpoint.bmobile` (permanent once first uploaded).

## Keys and where signing happens

Play App Signing is used: Google holds the **app signing key**; we hold only an **upload key**,
which proves an upload is ours. If the upload key is lost or leaked, Google can reset it (support
request), so it is recoverable, but treat it as a secret.

**Releases are built and signed by GitHub Actions, never on the dev VM or a laptop.** The upload
key exists only as secrets of the `b-mobile-play-release` Environment (plus a backup in the password
manager). Nothing runs until Ian approves it, and only `b-mobile-v*` tags may deploy to it.
Upload to Play is manual: download the signed bundle from the run and drop it in the Console.

### One-time setup (Ian, in GitHub settings)

1. **Environment** `b-mobile-play-release` (Settings, Environments): required reviewer = Ian; "Deployment
   branches and tags" = selected tags, pattern `b-mobile-v*`.
2. **Tag ruleset** (Settings, Rules, Rulesets, new tag ruleset): target `refs/tags/b-mobile-v*`,
   restrict creations (and updates/deletions) with only Ian on the bypass list, so agents and
   branches cannot trigger a release. Only approve runs for tags you created from a commit on
   `main` or `b-mobile-initial` (the workflow also checks this).
3. **Environment variables:** `VITE_BLIPFOTO_CLIENT_ID`, `VITE_OAUTH_REDIRECT_URI`
   (`bmobile://oauth/`), `VITE_NOTIFY_SERVICE_URL`, `UPLOAD_KEY_ALIAS`.
4. **Environment secrets:** `VITE_NOTIFY_REGISTRATION_SECRET`, `VITE_MAP_TILES_KEY`,
   `GOOGLE_SERVICES_JSON` (the file's contents; not secret, but gitignored), and the key itself:
   `UPLOAD_KEYSTORE_BASE64`, `UPLOAD_KEYSTORE_PASSWORD`, `UPLOAD_KEY_PASSWORD` (a PKCS12
   keystore has a single password, so set both password secrets to the same value).
   On Windows, with nothing to install: `[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\b-mobile-upload.jks).Path)) | Set-Clipboard`.
5. **The key:** created once with `keytool` (alias `upload`, RSA 2048, validity 9125 days, owner
   `CN=Salient Point Consulting Ltd, O=Salient Point Consulting Ltd, C=GB`). Attach the file to
   the password manager with its passwords and the certificate's SHA-256, then delete every other
   copy. Play shows the same SHA-256 after the first upload.

## Versioning

- `versionName` = the `version` in `packages/b-mobile/package.json`. Bump it for a real release.
- `versionCode` = `git rev-list --count HEAD`: rises with every commit, so no manual bump. Play
  needs it strictly higher than any previous upload; `BMOBILE_VERSION_CODE=<n>` overrides it.
- The in-app display version (`version.generated.json`, `RELEASE=1` drops the dev suffix) is a
  separate thing from these two.

## Release checklist

The b-mobile instance of the common checklist in the repo-root
[RELEASING.md](../../../RELEASING.md#components-and-the-common-checklist). Do these in order, on
the commit you intend to ship. Last run for real: 1.0.0 (2026-10-21).

1. **Changelog.** Move the b-mobile (and b-push, if it changed) entries under `[Unreleased]` in the
   root `CHANGELOG.md` into a section headed `## [b-mobile <version>] - <date>` (user-facing only;
   b-ark's sections are bare version numbers, so the prefix keeps them apart).
2. **Version.** Set `version` in `packages/b-mobile/package.json` **and** the `packages/b-mobile`
   entry in `package-lock.json` (it becomes `versionName`; `versionCode` is automatic, see above).
   b-mobile versions independently of b-ark.
3. **Generated data is current.** From `packages/b-mobile`:
   - `npm run licences:generate`, then `npm run licences:check` (the check fails if the committed
     `licences.generated.json` doesn't match `package-lock.json`). Commit any change. Do this
     _after_ the last merge from the integration branch, and again if you merge it later: a
     Dependabot bump that lands while the release PR is open changes the list (this happened on
     1.0.0), and the check then fails.
   - `npm run licences:native` if a Capacitor plugin or native dependency changed since the last
     release (needs `ANDROID_HOME` and a `cap sync`; see the repo `CLAUDE.md`). Commit
     `native-licences.generated.json`.
4. **Store material.** If behaviour, permissions or data handling changed, update
   [store/listing.md](../store/listing.md), [play-data-safety.md](play-data-safety.md) and the
   hosted privacy policy (`docs/b-mobile-privacy.html`) so what Play shows is true at submission.
5. **Merge the release PR, then tag and build.** The release PR (changelog, version, licences)
   merges to the integration branch. Ian then creates the tag `b-mobile-v<version>` and approves
   the run (see "Cutting an upload"): **the tag starts the build, so tagging comes before the
   smoke test and the upload.** To rehearse the whole pipeline without publishing, use a throwaway
   tag such as `b-mobile-v<version>-rc1`, then delete its release and tag.
6. **Smoke test the signed bundle on a real device** (install via the internal testing track, or
   `bundletool` from the AAB): sign in to Blipfoto, browse, open an entry, check Help & about shows
   the bare version and the licence list opens, and check the features this release touched.
   Sign-in and push registration are what a misconfigured build breaks (a wrong client ID or
   missing `google-services.json` in the Environment).
7. **Publish.** Upload the signed bundle in Play Console and promote it following Play's own track
   order (internal, then closed/production as applicable). Attach the release notes.
   Once the app is live on Google Play, replace "not on Google Play yet" on the Pages site
   (`docs/b-mobile.html`, a docs PR to `main`) with the Play link, and add the link to the
   listing/website fields if needed.
8. **Audit.** `npm audit --omit=dev --audit-level=high` clean. Findings below that threshold, and
   any with no matching Dependabot alert, are assessed in the release PR (1.0.0 had three
   moderate react-router advisories, judged not exploitable); alerts already dismissed on GitHub
   are not re-raised.

## Cutting an upload

1. Make sure the checklist above is done and the commit to ship is on `main` or
   `b-mobile-initial`, with `version` in `packages/b-mobile/package.json` set.
2. Ian creates the tag `b-mobile-v<version>` (for example `b-mobile-v1.0.0`; a suffix such as `-rc1`
   is allowed for test runs). Without git on his machine: GitHub, Releases, Draft a new release,
   choose a tag, type it, Create new tag on publish, target the integration branch (tick
   pre-release for a test), Publish. The tag version must equal `package.json`. Only Ian can do
   this (tag ruleset).
3. The workflow `Release b-mobile (Android)` starts and waits for approval. Ian approves it.
4. It builds from a clean clone, signs, verifies the signature and 16 KB alignment, prints the
   signing certificate in the run summary, and attaches `app-release.aab`.
5. Download the artifact: open the run, scroll to **Artifacts** at the bottom of its summary page and
   take `b-mobile-<tag>-aab` (a zip containing `app-release.aab`; kept for 30 days). Upload it
   in the Play Console (internal testing track first). The first ever upload to a new app must go
   through the Console by hand. That first upload registers the bundle's certificate as the upload
   key; compare its SHA-256 with your record (it is also in the run summary).

`scripts/build-release-aab.sh` with no arguments builds an unsigned bundle locally (checks only).

## Local signing (not the normal route)

`android/app/build.gradle` signs when `BMOBILE_UPLOAD_STORE_FILE`, `BMOBILE_UPLOAD_STORE_PASSWORD`,
`BMOBILE_UPLOAD_KEY_ALIAS` and `BMOBILE_UPLOAD_KEY_PASSWORD` are set; the workflow uses this via
`build-release-aab.sh --sign`. Do not put the real key on a development machine.
