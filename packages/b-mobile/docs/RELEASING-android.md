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

## Cutting an upload

1. Clean working tree on the commit to ship (the script refuses otherwise).
2. `android/app/google-services.json` present for the new Firebase app (gitignored; worktrees do
   not copy it) and `.env.local` at the repo root (client IDs, b-push URL; also gitignored).
3. `packages/b-mobile/scripts/build-release-aab.sh`. Output:
   `android/app/build/outputs/bundle/release/app-release.aab`.
4. Upload in Play Console (internal testing track first).

On the egress-controlled dev VM, see the Gradle proxy notes in the repo `CLAUDE.md`.
