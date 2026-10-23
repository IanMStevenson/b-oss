# Releasing b-oss

How to cut a public release of **b-ark** (Windows installer, published to
[GitHub Releases](https://github.com/IanMStevenson/b-oss/releases)).
Mac releases are blocked pending a Mac contributor — see
[CONTRIBUTING.md](CONTRIBUTING.md#mac-build).

## Overview

Tag-driven. Pushing a `b-ark-v*` tag (e.g. `b-ark-v1.0.6`; releases before 1.0.6 were plain `v*`) fires
[`.github/workflows/release-win.yml`](.github/workflows/release-win.yml),
which builds the workspaces, packages the NSIS installer with
[electron-builder](packages/b-ark/electron-builder.json), and uploads
`b-ark Setup <version>.exe`, `b-ark Setup <version>.exe.blockmap`, and
`latest.yml` to a draft release on GitHub. You then finalise that draft
manually (notes, SHA-256, latest-release tick) and publish.

Once published, existing b-ark installs at older versions detect the
new release on next launch via electron-updater (which reads
`latest.yml` from the GitHub Releases feed) and prompt the user to
update.

## Components and the common checklist

Each distributable component has its own release process; this file is the b-ark one and holds
the checklist the others follow ([b-oss#444](https://github.com/IanMStevenson/b-oss/issues/444)).

| Component    | How it is released                                                           | Process                                                                                    |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| b-ark        | Windows installer on GitHub Releases (Mac blocked)                           | This file                                                                                  |
| b-ark-chrome | Zip uploaded to the Chrome Web Store                                         | [packages/b-ark-chrome/RELEASING.md](packages/b-ark-chrome/RELEASING.md)                   |
| b-mobile     | Built and signed in CI from a gated tag; AAB uploaded to Google Play by hand | [packages/b-mobile/docs/RELEASING-android.md](packages/b-mobile/docs/RELEASING-android.md) |
| b-api        | Source only: consumers pull it from the repo                                 | [packages/b-api/RELEASING.md](packages/b-api/RELEASING.md)                                 |

b-ark and b-ark-chrome share a version number and a CHANGELOG section (1.0.5 shipped both). b-mobile
and b-api version independently.

Every release, whatever the component:

1. **Changelog.** Move `[Unreleased]` into a dated section; user-facing entries only.
2. **Version.** Bump every file that carries the version (listed per component) in one commit.
3. **Generated data is current.** Anything committed that is derived from dependencies or config
   must be regenerated and checked now, not per PR. Today that is only b-mobile's open-source
   licence lists (`npm run licences:generate`, then `npm run licences:check`, in `packages/b-mobile`);
   b-ark, b-ark-chrome and b-api have none.
4. **Release build.** Build with `RELEASE=1` so the in-app version is bare, from a clean tree.
5. **Smoke test the artifact** on a clean machine or profile, including signing in to Blipfoto.
6. **Publish** by the component's own route, then tag and finish the release notes. (b-mobile
   tags first: its tag starts the build.)
7. **Audit.** `npm audit --omit=dev --audit-level=high` must be clean (the b-ark workflow runs it);
   anything tolerated is recorded as a dismissed Dependabot alert with a reason.

## Invariants (read once, internalise)

1. **All version files bump together.** Root `package.json`,
   [packages/b-ark/package.json](packages/b-ark/package.json),
   [packages/b-ark-chrome/package.json](packages/b-ark-chrome/package.json) and
   [packages/b-ark-chrome/manifest.json](packages/b-ark-chrome/manifest.json) must match
   (the 1.0.5 release commit changed all four).
   Root drives the in-app version (via [scripts/version.mjs](scripts/version.mjs)
   → `version.generated.json` → `__APP_VERSION__`); b-ark drives the
   installer filename and `app.getVersion()`.
2. **`RELEASE=1` is required at build time** for the in-app version to be
   bare `0.1.0` rather than dev-style `0.1.0.<commits>.<build>`. The CI
   workflow sets this on its `version:bump` step; locally use
   `npm run build:release` or set `$env:RELEASE='1'` before
   `npm run dist:win`.
3. **Never re-publish a tag.** Once `b-ark-v0.1.0` is published and someone
   has installed it, you cannot ship a fix as another `b-ark-v0.1.0` —
   electron-updater compares version strings and "same version" means
   "no update available", so the broken install is stuck. Bump the
   patch instead. Re-publishing is only safe if you are absolutely
   certain no one (you included) has downloaded the release yet.
4. **GitHub release finalisation is manual** every time: ensure "Set as
   the latest release" is ticked, paste GitHub's own SHA-256 digest for
   the .exe into the notes (per [SECURITY.md](SECURITY.md); drops out
   once Authenticode signing lands), then click Publish.
5. **Smoke-test OAuth.** `MAIN_VITE_BLIPFOTO_CLIENT_ID` is inlined into
   the main-process bundle at build time. The only way to verify it
   actually made it is to install the shipped .exe on a clean machine
   and click _Add account_ — if Blipfoto's auth page opens, the env
   var made it; if you see "`MAIN_VITE_BLIPFOTO_CLIENT_ID is not set`",
   it didn't.

## Prerequisites (once per repo)

- Secret `BLIPFOTO_CLIENT_ID` set in
  [repo Actions secrets](https://github.com/IanMStevenson/b-oss/settings/secrets/actions).
  Surfaced to the b-ark build step as `MAIN_VITE_BLIPFOTO_CLIENT_ID`
  (the `MAIN_VITE_` prefix is required by electron-vite v5 for the
  main process).
- Repo Settings → Actions → General → Workflow permissions =
  **Read and write** (so `GITHUB_TOKEN` can create releases).
- Branch protection on `main` requires changes via PR with passing CI.
  An admin bypass exists for release fixes; prefer a PR for non-urgent
  changes.
- Code-signing secrets (`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`):
  intentionally unset for now — installer ships unsigned, SmartScreen
  warns on first download. See [kick-off/TODO.md](kick-off/TODO.md) for
  the signing follow-up.

## Cutting a release

### 1. Pre-flight on a clean working tree

```powershell
git status                                    # clean tree
git pull
npm ci
npm run typecheck
npm run lint
npm test
npm audit --omit=dev --audit-level=high       # same gate CI enforces
npm run build:release                         # writes bare version into version.generated.json
```

Review the [Dependabot queue](https://github.com/IanMStevenson/b-oss/pulls?q=is%3Aopen+author%3Aapp%2Fdependabot) —
merge or defer each open PR before tagging.

### 2. Update CHANGELOG.md

Move the contents of the `[Unreleased]` section in
[CHANGELOG.md](CHANGELOG.md) into a new section headed with the
target version and today's date, e.g. `## [0.1.1] - 2026-06-15`.
Leave a fresh empty `[Unreleased]` section above it for the next
cycle. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The CHANGELOG entry feeds into the release notes you'll paste into
GitHub at step 6, so keep it user-facing — features, fixes, breaking
changes — not internal refactors or test churn.

### 3. Local dry-run installer

Verifies packaging end-to-end before any tag is pushed.

```powershell
$env:RELEASE='1'
npm run dist:win --workspace=packages/b-ark
Remove-Item Env:RELEASE
```

**On Linux** (no Windows machine handy, no Wine installed on the host):

```bash
./scripts/build-win-docker.sh --release
```

Runs electron-builder's official Wine-bundled image
(`electronuserland/builder:wine`) via a disposable `docker run --rm` — same
output path, nothing left behind on the host or in the image.

Install `packages/b-ark/dist-electron/b-ark Setup <version>.exe`, launch it,
**open About** (expect bare version, e.g. `0.1.0` — never `0.0.0-dev` and
never `0.1.0.<commits>.<build>`), then **click Add account and confirm
OAuth opens a Blipfoto auth page** (proves `MAIN_VITE_BLIPFOTO_CLIENT_ID`
made it into the bundle). If both check out, the release is safe to push.

### 4. Bump versions

For a patch release (e.g. 0.1.0 → 0.1.1) — all version files in
lockstep per invariant #1:

```powershell
npm version 0.1.1 --no-git-tag-version
npm version 0.1.1 --workspace=packages/b-ark --no-git-tag-version
npm version 0.1.1 --workspace=packages/b-ark-chrome --no-git-tag-version
# then set "version" in packages/b-ark-chrome/manifest.json to 0.1.1 by hand
```

(`npm version patch` is a shorthand for the version arithmetic, but
it only operates on one package and creates a git tag we don't want
yet — using explicit version strings + `--no-git-tag-version` keeps
both bumps under our control.)

Commit:

```powershell
git add package.json packages/b-ark/package.json packages/b-ark-chrome/package.json \
  packages/b-ark-chrome/manifest.json package-lock.json CHANGELOG.md
git commit -m "Release v0.1.1"
git push origin main
```

### 5. Tag and push

```powershell
git tag -a b-ark-v0.1.1 -m "b-ark v0.1.1"
git push origin b-ark-v0.1.1
```

In VS Code: Command Palette → **Git: Push Tags** (the default sync
button does not push tags). The workflow fires within a few seconds —
watch at https://github.com/IanMStevenson/b-oss/actions, expect 5–10
minutes.

### 6. Finalise the draft release

When the workflow finishes, a draft appears at
https://github.com/IanMStevenson/b-oss/releases with three assets
attached. Click _Edit_ and:

1. Ensure **Set as the latest release** is ticked (we're past 1.0 now —
   this replaces the old "Set as a pre-release" step from the pre-1.0
   era).
2. Copy the SHA-256 digest GitHub already computes for
   `b-ark Setup <version>.exe` — visible next to the asset in the draft
   editor, or via `gh api repos/IanMStevenson/b-oss/releases/<id> --jq
'.assets[] | select(.name | endswith(".exe")) | .digest'`. No manual
   hashing needed; GitHub generates this itself for every uploaded
   asset.
3. Write release notes — paste the relevant section from
   [CHANGELOG.md](CHANGELOG.md) as the body, then add the SHA-256 and
   limitations footer. Template:

   ```
   <one-line headline of what changed>

   <CHANGELOG section for this version: Added / Changed / Fixed>

   **Known limitations**: Windows x64 only; Mac build not yet shipped; unsigned installer.

   **SHA-256** (`b-ark Setup <version>.exe`): <paste digest, e.g. sha256:...>

   Please report issues at https://github.com/IanMStevenson/b-oss/issues.
   ```

4. Click **Publish release**.

**The "latest download" link updates itself.** Publishing a `b-ark-v*` release runs the
`b-ark latest download` workflow (`.github/workflows/b-ark-latest.yml`), which copies the installer
to a permanent release, `b-ark-latest`, as `b-ark-Setup.exe`. The website, README and user guide link
to `https://github.com/IanMStevenson/b-oss/releases/download/b-ark-latest/b-ark-Setup.exe`, so nothing
needs editing per release. Check the workflow run went green (it verifies the SHA-256). If it didn't,
re-run it from the Actions tab with the tag (e.g. `b-ark-v1.0.6`). Never edit or delete `b-ark-latest` by
hand. Only b-ark releases (`b-ark-v<number>`, or an old `v<number>`) feed it; b-mobile and pre-releases are ignored.

**Updates do not use GitHub's "Latest" flag.** Installed b-ark apps read their update feed (`latest.yml`,
the installer and its blockmap) from the same permanent `b-ark-latest` release
(`packages/b-ark/src/main/updater.ts`), so another package's release can't break them. The tick
box on a b-ark release is no longer load-bearing, and nothing about b-mobile or other packages'
releases affects updates. The workflow refuses to publish a feed whose `latest.yml` doesn't match the
installer (version, file name and SHA-512), and finishes by fetching the public feed address.

Versions before the one that introduced this (1.0.5 and older) still use GitHub's Latest flag, so
the first release carrying the change must be published with **Set as the latest release** ticked, once,
for those installs to find it.

### Holding a release back (publish as a pre-release first)

When someone else should test the installer before anyone is pointed at it, publish the draft with
**Set as a pre-release** ticked and **not** "Set as the latest release". A pre-release is ignored by
the `b-ark latest download` workflow (its `if` skips pre-releases) and by the in-app updater
(`allowPrerelease = false`), so `b-ark-latest` (the website download link and the update feed for
current installs) stays on the previous version. The tester downloads the installer from the
pre-release's own page.

To promote it after sign-off:

1. Edit the release: untick **Set as a pre-release** and tick **Set as the latest release** (the
   tick matters once, for the first release carrying the `b-ark-latest` feed; see above).
2. Run the workflow by hand: Actions → **b-ark latest download** → Run workflow with the tag, or
   `gh workflow run b-ark-latest.yml -f tag=b-ark-v1.0.6`. Changing a pre-release into a release
   fires GitHub's `released` event, which the workflow does not listen to (it runs on `published`),
   so it will not start on its own.
3. Check the run is green and `https://github.com/IanMStevenson/b-oss/releases/download/b-ark-latest/latest.yml`
   names the new version.

### 7. Smoke-test from a second machine

Download the published .exe on a different machine (or fresh VM), install,
launch, **check About shows the bare version**, **click Add account and
complete OAuth**, run a small backup. Catches the class of bug where dev
machine state masks a problem in the shipped artifact.

## Failure modes

Symptoms seen in the wild, with the diagnosis:

- **`MAIN_VITE_BLIPFOTO_CLIENT_ID is not set`** in the shipped app at
  OAuth time — the env was set on the wrong workflow step. Vite inlines
  `import.meta.env.MAIN_VITE_*` at build time, so the env must be on
  the `npm run build --workspace=packages/b-ark` step, not the publish
  step that just runs electron-builder.
- **Workflow fails with `Application entry file "dist\main\index.js" …
is corrupted`** — electron-builder was asked to package b-ark but
  b-ark itself was not built. The workflow's b-ark build step is
  required between the library builds and the publish step;
  `npm run release` is bare `electron-builder` and does not rebuild.
- **`HttpError: 404 Not Found` on
  `api.github.com/repos/<owner>/b-oss/releases`** — the
  [electron-builder publish target](packages/b-ark/electron-builder.json)
  `publish.owner` does not match the actual GitHub owner. Despite
  GitHub's HTML URLs being case-insensitive, the API treats
  `ianstevenson` and `IanMStevenson` as different identifiers — use
  the canonical case (`IanMStevenson`).
- **About dialog shows `0.0.0-dev` in the installed app** — the CI
  build ran without `RELEASE=1` (or without `version.generated.json`
  having been written). Confirm the workflow's `version:bump` step
  has `RELEASE: '1'` in its env block.
- **About dialog shows `0.1.0.<commits>.<build>` in the installed
  app** — same root cause as above, but `version:bump` ran without
  `RELEASE=1`. Bare version requires the env var.
- **Workflow fails at `npm run release` with "GitHub Personal Access
  Token is not set"** — repo workflow permissions are not Read+Write.
  Fix in Settings → Actions → General.
- **`git push origin main` rejected with
  `Changes must be made through a pull request`** — main is protected.
  Push to a branch, open a PR, wait for CI. The admin bypass exists for
  release-critical fixes; use sparingly.
- **SmartScreen blocks the .exe entirely** — expected for the first
  downloads of an unsigned binary from a new publisher. _More info →
  Run anyway_ is the documented escape hatch. Reputation accrues with
  downloads; persistent blocking is the argument for Authenticode
  (deferred — see [kick-off/TODO.md](kick-off/TODO.md)).
- **Need to retract a broken release** — delete the GitHub release
  (`gh release delete b-ark-v0.1.x --yes --cleanup-tag`), bump to the next
  patch version, cut a new release. Do not re-tag the same version
  once anyone has downloaded — electron-updater compares version
  strings and "same version" reads as "no update needed", leaving the
  broken install stuck.
- **Two draft releases appear for the same tag** — a `.exe` +
  `latest.yml` draft and a separate `.exe.blockmap`-only draft.
  Reproduced on both the 1.0.2 and 1.0.3 attempts; looks like an
  electron-builder GitHub-provider race uploading multiple assets
  right after tag creation, not anything in our config. Recovery:
  download the blockmap from the orphan draft
  (`gh api repos/<owner>/b-oss/releases/assets/<id> -H "Accept:
application/octet-stream" > blockmap`), upload it to the correct
  draft (`gh api --method POST -H "Content-Type:
application/octet-stream"
"https://uploads.github.com/repos/<owner>/b-oss/releases/<id>/assets?name=<exe>.blockmap"
--input blockmap`), then delete the now-empty orphan draft. Always
  check the release's asset count/list before trusting it — don't
  assume the first draft you see is complete.

## When the release process itself changes

Update this file in the same PR. The release runbook drifts faster
than any other doc because it lives at the seam between code, config,
and external services; out-of-date here costs an entire release cycle
to discover.
