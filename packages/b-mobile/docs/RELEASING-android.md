# Releasing b-mobile to Google Play

Release is manual. Publisher: Salient Point (Play developer account). Application ID
`uk.co.salientpoint.bmobile` (permanent once first uploaded).

## Keys

Play App Signing is used: Google holds the **app signing key**; we hold only an **upload key**,
which proves an upload is ours. If the upload key is lost or leaked, Google can reset it (support
request), so it is recoverable, but treat it as a secret.

**The upload key lives on Windows only, never on the build VM.** The VM builds an unsigned
bundle; signing happens on the machine that holds the key. Upload is manual (Play Console).

- Keep the keystore outside any synced or shared folder (not under the repo, the Mutagen relays
  or the Samba-shared tree), with a backup in the password manager (attach the file).
- Alias, keystore password and key password: in the password manager. Also record the
  certificate's SHA-256 fingerprint; Play shows it after the first upload.

### One-time setup on Windows

1. Install a JDK, which provides `keytool` and `jarsigner` (no Android SDK or Android Studio
   needed): `winget install EclipseAdoptium.Temurin.21.JDK`, then reopen the terminal and check
   `keytool -help`.
2. Create the key (it prompts for the passwords):

```powershell
keytool -genkeypair -v -keystore C:\keys\b-mobile-upload.jks -alias upload `
  -keyalg RSA -keysize 2048 -validity 9125 `
  -dname "CN=Salient Point Consulting Ltd, O=Salient Point Consulting Ltd, C=GB"
```

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

1. **On the VM:** clean working tree on the commit to ship (the script refuses otherwise), with
   `android/app/google-services.json` (gitignored; worktrees do not copy it) and `.env.local` at
   the repo root present. Run `packages/b-mobile/scripts/build-release-aab.sh`. Output, UNSIGNED:
   `android/app/build/outputs/bundle/release/app-release.aab`. Check it is 16 KB-aligned if native
   libraries changed (see #360).
2. **Move it to Windows:** the dev tree is shared over Samba, so the file is at
   `X:\<worktree>\packages\b-mobile\android\app\build\outputs\bundle\release\app-release.aab`
   (the drive letter depends on the box).
3. **On Windows:** `scripts\sign-aab.ps1 -Aab <that file> -Keystore C:\keys\b-mobile-upload.jks`.
   It writes `app-release-signed.aab` and prints the signing certificate. (Without the script:
   `jarsigner -keystore <jks> -sigalg SHA256withRSA -digestalg SHA-256 <aab> upload`.)
4. **Upload** the signed file in the Play Console (internal testing track first). The first upload
   registers its certificate as the upload key; compare the SHA-256 with the one you recorded.

On the egress-controlled dev VM, see the Gradle proxy notes in the repo `CLAUDE.md`.

## Optional: signing on the build machine

`android/app/build.gradle` can sign during the build if `BMOBILE_UPLOAD_STORE_FILE`,
`BMOBILE_UPLOAD_STORE_PASSWORD`, `BMOBILE_UPLOAD_KEY_ALIAS` and `BMOBILE_UPLOAD_KEY_PASSWORD` are
set. The standard flow does not use it, and `build-release-aab.sh` deliberately ignores it.
