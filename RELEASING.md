# Releasing b-oss

How to cut a public release of **b-ark** (Windows installer, published to
[GitHub Releases](https://github.com/IanMStevenson/b-oss/releases)).
Mac releases are blocked pending a Mac contributor — see
[CONTRIBUTING.md](CONTRIBUTING.md#mac-build).

## Overview

Tag-driven. Pushing a `v*` tag fires
[`.github/workflows/release-win.yml`](.github/workflows/release-win.yml),
which builds the workspaces, packages the NSIS installer with
[electron-builder](packages/b-ark/electron-builder.json), and uploads
`b-ark Setup <version>.exe`, `b-ark Setup <version>.exe.blockmap`, and
`latest.yml` to a draft release on GitHub. You then finalise that draft
manually (notes, SHA-512, pre-release tick) and publish.

Once published, existing b-ark installs at older versions detect the
new release on next launch via electron-updater (which reads
`latest.yml` from the GitHub Releases feed) and prompt the user to
update.

## Invariants (read once, internalise)

1. **Both `package.json` versions bump together.** Root and
   [packages/b-ark/package.json](packages/b-ark/package.json) must match.
   Root drives the in-app version (via [scripts/version.mjs](scripts/version.mjs)
   → `version.generated.json` → `__APP_VERSION__`); b-ark drives the
   installer filename and `app.getVersion()`.
2. **`RELEASE=1` is required at build time** for the in-app version to be
   bare `0.1.0` rather than dev-style `0.1.0.<commits>.<build>`. The CI
   workflow sets this on its `version:bump` step; locally use
   `npm run build:release` or set `$env:RELEASE='1'` before
   `npm run dist:win`.
3. **Never re-publish a tag.** Once `v0.1.0` is published and someone
   has installed it, you cannot ship a fix as another `v0.1.0` —
   electron-updater compares version strings and "same version" means
   "no update available", so the broken install is stuck. Bump the
   patch instead. Re-publishing is only safe if you are absolutely
   certain no one (you included) has downloaded the release yet.
4. **GitHub release finalisation is manual** every time: tick
   "Set as a pre-release" (while we're pre-1.0), compute and paste the
   SHA-512 of the .exe into the notes (per [SECURITY.md](SECURITY.md);
   drops out once Authenticode signing lands), then click Publish.
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

Install `packages/b-ark/dist-electron/b-ark Setup <version>.exe`, launch it,
**open About** (expect bare version, e.g. `0.1.0` — never `0.0.0-dev` and
never `0.1.0.<commits>.<build>`), then **click Add account and confirm
OAuth opens a Blipfoto auth page** (proves `MAIN_VITE_BLIPFOTO_CLIENT_ID`
made it into the bundle). If both check out, the release is safe to push.

### 4. Bump versions

For a patch release (e.g. 0.1.0 → 0.1.1) — both `package.json` files
in lockstep per invariant #1:

```powershell
npm version 0.1.1 --no-git-tag-version
npm version 0.1.1 --workspace=packages/b-ark --no-git-tag-version
```

(`npm version patch` is a shorthand for the version arithmetic, but
it only operates on one package and creates a git tag we don't want
yet — using explicit version strings + `--no-git-tag-version` keeps
both bumps under our control.)

Commit:

```powershell
git add package.json packages/b-ark/package.json package-lock.json CHANGELOG.md
git commit -m "Release v0.1.1"
git push origin main
```

### 5. Tag and push

```powershell
git tag -a v0.1.1 -m "b-ark v0.1.1"
git push origin v0.1.1
```

In VS Code: Command Palette → **Git: Push Tags** (the default sync
button does not push tags). The workflow fires within a few seconds —
watch at https://github.com/IanMStevenson/b-oss/actions, expect 5–10
minutes.

### 6. Finalise the draft release

When the workflow finishes, a draft appears at
https://github.com/IanMStevenson/b-oss/releases with three assets
attached. Click _Edit_ and:

1. Tick **Set as a pre-release** (while we're pre-1.0).
2. Download `b-ark Setup <version>.exe` from the draft and compute its
   SHA-512:

   ```powershell
   Get-FileHash -Algorithm SHA512 "$env:USERPROFILE\Downloads\b-ark Setup <version>.exe" | Format-List
   ```

3. Write release notes — paste the relevant section from
   [CHANGELOG.md](CHANGELOG.md) as the body, then add the SHA-512 and
   limitations footer. Template:

   ```
   <one-line headline of what changed>

   <CHANGELOG section for this version: Added / Changed / Fixed>

   **Known limitations**: Windows x64 only; Mac build not yet shipped; unsigned installer.

   **SHA-512** (`b-ark Setup <version>.exe`): <paste hash>

   Please report issues at https://github.com/IanMStevenson/b-oss/issues.
   ```

4. Click **Publish release**.

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
  (`gh release delete v0.1.x --yes --cleanup-tag`), bump to the next
  patch version, cut a new release. Do not re-tag the same version
  once anyone has downloaded — electron-updater compares version
  strings and "same version" reads as "no update needed", leaving the
  broken install stuck.

## When the release process itself changes

Update this file in the same PR. The release runbook drifts faster
than any other doc because it lives at the seam between code, config,
and external services; out-of-date here costs an entire release cycle
to discover.
