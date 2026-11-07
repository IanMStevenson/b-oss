# Maintainer's environment

> **Agents reading this file: assume you are NOT in the maintainer's environment, and that this file does
> not apply to you, UNLESS** running `hostname` prints a name starting with `ims-dev-` (the maintainer's
> agent machines are `ims-dev-o1` and `ims-dev-1`). If it does not, stop reading: nothing below is
> needed to build, test or contribute, and following it (paths, proxy settings, Mutagen relays) would only
> break your setup. The general instructions are in [CLAUDE.md](../CLAUDE.md) and the
> [contributor guide](CONTRIBUTOR-GUIDE.md).

Notes on how the maintainer's own machines are set up: an isolated Linux box that agents work on, with
live mirrors to a Windows PC for testing, and an egress-controlled network. They were moved here from
`CLAUDE.md` and `packages/b-mobile-pc/README.md` (b-oss#931). "Ian" is the maintainer. "The VM" and "the
dev box" mean these Linux machines.

## Mutagen dev-loop (Windows)

Live Windows mirrors exist for local testing/debugging without a manual
git-pull-and-refresh cycle - see
`devutils/dev-vm-setup/mutagen-dev-loop-pattern.md` for the full pattern
and the repoint command for "make that worktree available via Mutagen."

- **b-ark** (debugging): local relay `b-ark-relay` → `~/live/b-ark-repo`
  (the **whole monorepo**, not just `packages/b-ark` - `.vscode/launch.json`
  needs the full workspace root) → Windows `D:\Dev\debugging\b-ark-build`.
  Because the sync source is the repo root, `b-ark-relay` must be recreated
  with `--ignore-vcs --ignore=node_modules/` (Windows keeps its own
  `node_modules`; the other two relays sync a subfolder so don't need this).
  The launch config runs `electron.cmd .` against the synced
  `packages/b-ark/dist/`, so `npm run build` on the VM in the feeding
  worktree is part of the loop. Full details + gotchas:
  `devutils/dev-vm-setup/mutagen-dev-loop-pattern.md`.
- **b-ark-chrome** (Chrome "Load unpacked"): local relay
  `b-ark-chrome-relay` → `~/live/b-ark-chrome-dist` (built `dist/`, needs
  `npm run dev` running in whichever worktree feeds it) → Windows
  `D:\Dev\chrome-live\b-ark-chrome-build`.
- **b-mobile-pc** (Windows testing of the desktop shell):
  local relay `b-mobile-pc-relay` → `~/live/b-mobile-pc-repo` (the **whole monorepo**, created with
  `--ignore-vcs --ignore=node_modules/ --ignore=e2e-out/` like b-ark's) → Windows
  `D:\Dev\debugging\b-mobile-pc-build` through `b-mobile-pc-live` (Ian creates that session once). It
  runs `electron.cmd` against the synced `packages/b-mobile-pc/dist`, which serves
  `packages/b-mobile/dist`, so build **both** (`npm run build -w @b-oss/b-mobile -w @b-oss/b-mobile-pc`)
  on the VM in the feeding worktree. Steps and the VS Code launch config:
  `packages/b-mobile-pc/README.md`. The relay's source is whichever worktree was last pointed at it
  (repoint with the terminate/create pair above).
  The same relay also carries the packaged app's `dist-electron/win-unpacked/` (installers, `*.blockmap`,
  `*.yml` and `linux-unpacked/` are ignored), so on Windows run
  `packages\b-mobile-pc\dist-electron\win-unpacked\b-mobile.exe` from the synced folder: fast launch,
  no unpacking, a few MB per rebuild. See `packages/b-mobile-pc/README.md`.
  **When Ian asks for a b-mobile-pc build "on Mutagen", he means this unpacked folder**, not the
  `dist/` + `electron.cmd` loop: run `packages/b-mobile-pc/scripts/build-win-docker.sh` in the feeding
  worktree (it also makes the installers, which stay out of the relay), flush the relay, and give him the
  version. b-mobile shows its own package version (e.g. `1.3.0`) plus the suffix, not the root's.
  Git is unavailable inside Docker, so the script passes the host's commit count in as
  `BOSS_COMMIT_COUNT` (b-oss#875) and the digit matches a local build.

## b-mobile-pc dev loop (Windows): quit before a build lands

Running `packages/b-mobile-pc/dist-electron/win-unpacked/b-mobile.exe` from the synced folder: quit the
app completely first (tray icon > Exit; end any `b-mobile.exe` in Task Manager), check `mutagen sync list`
for transition problems, `mutagen sync flush`, then launch. Do not turn notifications on in the synced
folder (it would register that folder at login; the shell now refuses), test them with the Setup-installed
copy. A banner "running older program files than its web files" means an old process is still running.
Details: `packages/b-mobile-pc/README.md`, "Dev-loop hazards" (b-oss#696).

### b-mobile-pc: run the unpacked build from the synced folder

Do not run the exes from a network share. The portable exe unpacks about 360 MB into `%TEMP%` on every
launch, which is slow anywhere and much slower over Samba. A build's `win-unpacked/` folder is the
same app already unpacked, and only about 4 MB of it changes between builds (`resources/app.asar` and
`resources/web`; the rest is the Electron runtime). The dev-loop relay below already carries it, so run
`b-mobile.exe` from the synced folder:

```
D:\Dev\debugging\b-mobile-pc-build\packages\b-mobile-pc\dist-electron\win-unpacked\b-mobile.exe
```

The one VM relay (`b-mobile-pc-relay`, below) ignores the installers, `*.blockmap`, `*.yml` and
`linux-unpacked/` under `dist-electron/` but not `win-unpacked/`, so after
`packages/b-mobile-pc/scripts/build-win-docker.sh` on the VM only a few MB arrive. (`win-unpacked/` is
recreated by every build; that is fine here because the relay's root is the whole repo, but a relay
rooted at `win-unpacked/` itself would halt with "root deletion".) Start-with-login is **not** registered
from a dev folder (see "Dev-loop hazards" below), so test notifications with the Setup-installed copy.

## b-mobile-pc: testing on Windows (Mutagen dev loop)

**Exit the app from the tray before testing a new synced build.** Closing the window only hides it, so
the old instance keeps running while its files are replaced underneath it, and its lazily loaded screens
then fail to load. The app reloads itself once when that happens (`platform/staleSession.ts`, b-oss#678),
but a clean start is what you want when testing.

Same two-hop pattern as b-ark (`devutils/dev-vm-setup/mutagen-dev-loop-pattern.md`): a VM-only relay
mirrors a worktree into a stable staging folder, and a cross-machine session mirrors that to Windows.

On the VM (done; this is the part the agent can do):

```bash
# relay: b-mobile-pc-relay  ->  ~/live/b-mobile-pc-repo   (whole repo, so VS Code on Windows has the workspace)
D=packages/b-mobile-pc/dist-electron
mutagen sync terminate b-mobile-pc-relay
mutagen sync create --name=b-mobile-pc-relay --sync-mode=one-way-replica \
  --ignore-vcs --ignore=node_modules/ --ignore=e2e-out/ --ignore=/.git \
  --ignore="/$D/*.exe" --ignore="/$D/*.blockmap" --ignore="/$D/*.yml" \
  --ignore="/$D/linux-unpacked/" --ignore="/$D/.icon-ico/" \
  <worktree> ~/live/b-mobile-pc-repo
# build in the feeding worktree, then the change is on Windows within seconds
npm run build -w @b-oss/b-mobile && npm run build -w @b-oss/b-mobile-pc
```

The `--ignore` flags matter for the same reason as b-ark's: Windows keeps its own `node_modules` (with
the Windows Electron binary), and a one-way replica does not delete paths that were already copied
before an ignore was added.

On Windows (once; Ian's part; PowerShell):

```powershell
mutagen sync create --name=b-mobile-pc-live --sync-mode=one-way-replica `
  ims-dev-o1:live/b-mobile-pc-repo "D:\Dev\debugging\b-mobile-pc-build"
cd D:\Dev\debugging\b-mobile-pc-build
npm ci          # installs the Windows Electron binary and node_modules (they are not synced)
code .          # then run "Electron Main (b-mobile-pc)" from the Run and Debug panel
```

or without VS Code: `node_modules\.bin\electron.cmd packages\b-mobile-pc`. The shell serves
`packages/b-mobile/dist`, so both builds above must have run on the VM. The sign-in client id comes
from the `.env.local` that is copied into the worktree on the VM (see CLAUDE.md, "Local build
credentials"); it is baked into b-mobile's build.

## Building Gradle/Android on the egress-controlled dev VM

Outbound traffic goes through a squid proxy (`localhost:3128`) with a per-domain rate limit
(20 new connections/min). Two gotchas for `./gradlew` (b-mobile):

- The JVM ignores `HTTP(S)_PROXY` env vars. Put `systemProp.http(s).proxyHost/proxyPort`
  in `~/.gradle/gradle.properties`, and pass `JAVA_TOOL_OPTIONS="-Dhttps.proxyHost=localhost
-Dhttps.proxyPort=3128"` for the first run so the wrapper can download Gradle itself.
- A `403 Forbidden` from `dl.google.com` is the rate limiter (`TCP_DENIED/403` in
  `/var/log/squid/access.log`), not a blocked host. Gradle caches what it fetched, so retry
  with `--max-workers=2` (a pause between attempts helps).
- `npm ci` fails in Electron's postinstall (binary download blocked); use `--ignore-scripts`
  for Android-only work.

## Egress proxy, other places it matters

- Gradle (`./gradlew` in `packages/b-mobile`): see the section above. The JVM ignores `HTTP(S)_PROXY`, so
  on the dev VMs egress goes through the squid proxy set in `~/.gradle/gradle.properties`
  (`systemProp.http(s).proxyHost=localhost`, port `3128`). Verified on ims-dev-o1 on 2026-10-08.
- The Android emulator rig downloads its SDK through the same proxy; see
  `packages/b-mobile/scripts/emulator/README.md`.

## Credentials: where the canonical copies live

On the dev VMs the canonical `google-services.json` is `~/.config/b-mobile/google-services.json` (mode
600; it has clients for both package names). A new worktree needs it symlinked in:
`ln -s ~/.config/b-mobile/google-services.json <worktree>/packages/b-mobile/android/app/google-services.json`.
`.env.local` and `.env.android-debug.local` are copied from the main checkout.
