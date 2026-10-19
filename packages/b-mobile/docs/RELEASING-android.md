# Releasing b-mobile to Google Play

Release is manual. Publisher: Salient Point (Play developer account). Application ID
`uk.co.salientpoint.bmobile` (permanent once first uploaded).

## Keys

Play App Signing is used: Google holds the **app signing key**; we hold only an **upload key**,
which proves an upload is ours. If the upload key is lost or leaked, Google can reset it (support
request), so it is recoverable — but treat it as a secret.

- Keystore file: outside the repo, `chmod 600`, with a backup in a second place (password manager
  attachment or encrypted store). `*.jks` and `*.keystore` are gitignored as a safety net.
- Alias, keystore password and key password: in the password manager.

Create it once:

```bash
keytool -genkeypair -v -keystore <path>/b-mobile-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 9125 \
  -dname "CN=Salient Point, O=Salient Point, C=GB"
```

## Build settings

`android/app/build.gradle` reads these from the environment or `~/.gradle/gradle.properties`:

| Name                            | Meaning                     |
| ------------------------------- | --------------------------- |
| `BMOBILE_UPLOAD_STORE_FILE`     | Absolute path to the `.jks` |
| `BMOBILE_UPLOAD_STORE_PASSWORD` | Keystore password           |
| `BMOBILE_UPLOAD_KEY_ALIAS`      | Key alias (`upload`)        |
| `BMOBILE_UPLOAD_KEY_PASSWORD`   | Key password                |

If `BMOBILE_UPLOAD_STORE_FILE` is unset, `bundleRelease` still builds but unsigned, which Play
rejects; `scripts/build-release-aab.sh` refuses to run without all four.

## Versioning

- `versionName` = the `version` in `packages/b-mobile/package.json`. Bump it for a real release.
- `versionCode` = `git rev-list --count HEAD`: rises with every commit, so no manual bump. Play
  needs it strictly higher than any previous upload; `BMOBILE_VERSION_CODE=<n>` overrides it.
- The in-app display version (`version.generated.json`, `RELEASE=1` drops the dev suffix) is a
  separate thing from these two.

## Release checklist

The b-mobile instance of the common checklist in the repo-root
[RELEASING.md](../../../RELEASING.md#components-and-the-common-checklist). Do these in order, on
the commit you intend to ship.

1. **Changelog.** Move the b-mobile entries under `[Unreleased]` in the root `CHANGELOG.md` into a
   dated section (user-facing only).
2. **Version.** Bump `version` in `packages/b-mobile/package.json` (it becomes `versionName`;
   `versionCode` is automatic, see above). b-mobile versions independently of b-ark.
3. **Generated data is current.** From `packages/b-mobile`:
   - `npm run licences:generate`, then `npm run licences:check` (the check fails if the committed
     `licences.generated.json` doesn't match `package-lock.json`). Commit any change. This must
     happen _before_ step 5: the build also regenerates this file, and the build script refuses a
     dirty tree.
   - `npm run licences:native` if a Capacitor plugin or native dependency changed since the last
     release (needs `ANDROID_HOME` and a `cap sync`; see the repo `CLAUDE.md`). Commit
     `native-licences.generated.json`.
4. **Store material.** If behaviour, permissions or data handling changed, update
   [store/listing.md](../store/listing.md), [play-data-safety.md](play-data-safety.md) and the
   hosted privacy policy (`docs/b-mobile-privacy.html`) so what Play shows is true at submission.
5. **Build.** `packages/b-mobile/scripts/build-release-aab.sh` (see "Cutting an upload").
6. **Smoke test the release build on a real device** (install via the internal testing track, or
   `bundletool` from the AAB): sign in to Blipfoto, browse, open an entry, check Help & about shows
   the bare version and the licence list opens, and check the features this release touched.
   Sign-in and push registration are what a misconfigured build breaks (missing `.env.local` client
   ID, missing `google-services.json`).
7. **Publish.** Promote from internal testing in Play Console, following Play's own track order
   (internal, then closed/production as applicable). Tag the commit (`b-mobile-v<version>`) and
   attach the release notes.
8. **Audit.** `npm audit --omit=dev --audit-level=high` clean, or tolerated alerts dismissed on
   GitHub with a reason.

## Cutting an upload

1. Clean working tree on the commit to ship (the script refuses otherwise).
2. `android/app/google-services.json` present for the new Firebase app (gitignored; worktrees do
   not copy it) and `.env.local` at the repo root (client IDs, b-push URL; also gitignored).
3. `packages/b-mobile/scripts/build-release-aab.sh`. Output:
   `android/app/build/outputs/bundle/release/app-release.aab`.
4. Upload in Play Console (internal testing track first).

On the egress-controlled dev VM, see the Gradle proxy notes in the repo `CLAUDE.md`.
