# b-mobile-pc

b-mobile on desktop: an Electron shell that packages b-mobile's web build. Epic
[b-oss#605](https://github.com/IanMStevenson/b-oss/issues/605); this package is
[b-oss#609](https://github.com/IanMStevenson/b-oss/issues/609). It lives on the long-running
`integration/b-mobile-pc` branch (see `docs/integration-b-mobile-pc.md`), not `main`.

## What it does

- Serves b-mobile's `dist/` on a private origin, `app://b-mobile/`, and forwards `/api/blipfoto/*` to
  the Blipfoto API on that origin (the same trick `vite dev` uses), so the web app's plain
  `fetch()`/`FormData` paths work with no CORS problem and no desktop-specific HTTP code.
- Keeps secrets (access tokens) in the OS keystore via Electron's async `safeStorage`, and **refuses
  to fall back to plaintext** (on Linux, a `basic_text` backend counts as unavailable).
- Runs the sign-in page in a throwaway window with its own in-memory session and captures the
  custom-scheme redirect.
- Polls for new comments and notifications (b-oss#610) so the OS can tell the user with the window
  closed: see "Desktop notifications" below.
- Hardening: sandboxed renderer with context isolation, a CSP (inline scripts allowed by hash only),
  navigation and `window.open` lock-down, permission requests denied, single-instance lock, IPC only
  from the app's own origin.

## Layout

| Path                                  | Purpose                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/main/app-protocol.ts`            | Pure: what an `app://` request does (static file, API proxy, reject), CSP, header sanitising |
| `src/main/secure-store.ts`            | Encrypted key/value store over injected crypto and file IO                                   |
| `src/main/auth-request.ts`            | Pure: what the sign-in window may be asked to open                                           |
| `src/main/window-state.ts`            | Pure: restore window size/position safely                                                    |
| `src/main/notify-poller.ts`           | The poller: one timer, the shared count-diff rule, state file, back-off, dead-token handling |
| `src/main/notify-shell.ts`            | Electron side of notifications: OS notification, tray, hide-to-tray, login item, exit dialog |
| `src/main/login-item-policy.ts`       | Pure: no start-at-login item from a dev folder (b-oss#696)                                   |
| `src/main/index.ts`, `auth-window.ts` | Electron wiring (not unit-tested; covered by the e2e harness, b-oss#614)                     |
| `src/preload/index.ts`                | Exposes `window.bMobileDesktop` (`src/shared/bridge.ts` is the contract)                     |

b-mobile holds a matching copy of the bridge types in its platform layer, because it must not depend on
this package.

## Desktop notifications

Decisions are on b-oss#610. The main process polls Blipfoto's unread **counts** (`messages/totals/unread`
through `@b-oss/b-notify-core`; never comment or notification content, because reading those marks them
read) every **5 minutes**, with the account's single app token read from the secure store at poll time
(`token:<accountId>:app`, never cached). There is no second token and no separate sign-in round.

- The web app sends the watched accounts and their stream switches with `notify.configure()`; accounts
  with every stream off are left out. The poller keeps the last-seen counts and that configuration in
  `userData/notify-state.json` (atomic write), so polling carries on with no window and a restart neither
  repeats nor loses a notification. An account's first poll only records its starting counts.
- A rise in a stream the user left on shows an OS notification **even when the window is focused**; a click
  brings the window forward and sends the same payload b-mobile's push taps use (`kind: 'activity'` or
  `'reauth-required'`) to the page, which routes it. A notification that cannot be shown keeps the old
  count so the next poll tries again.
- A rejected token (Blipfoto codes 50/51) shows one "sign in again" notification and stops polling that
  account until the app has removed and re-added it. Errors back off (every 2nd, 3rd... tick, capped at
  every 7th); nothing polls while the OS reports offline.
- **Final defaults (Ian's, b-oss#610):** enabling notifications for any account makes the app
  tray-resident **and** start with the user's login (`setLoginItemSettings({ openAtLogin: true })`,
  turned off again when the last account's notifications go off; a start by the login item goes
  straight to the tray, no window). There is no separate launch-at-login setting. The window's close
  button only **hides** the window while notifications are on (with them off it quits as before). A
  real exit is only the tray icon's right-click menu (**Open b-mobile**, **Exit**); Exit asks "Exit
  b-mobile? Notifications will stop until you start b-mobile again." (Exit / Cancel) while notifications
  are on, and quits at once with them off. Exiting does **not** change the notifications setting: they
  stop while the app is closed and resume next start. Only the user's own close is intercepted: quits
  from `app.quit()`, an updater, or the OS ending the session still quit. No taskbar badges yet; if the
  app is fully quit, nothing polls. The decisions are small pure functions (`src/main/tray-policy.ts`).
- Not covered by anything runnable on the dev VM: real Windows toasts (they need the installer's
  AppUserModelID, b-oss#612), the tray on Windows, login items, and the real keystore. The tray icon is
  read from `resources/tray-icon.png` when packaged; the installer work has to ship it.

## Running it

```bash
npm run build -w @b-oss/b-mobile        # the web build this shell serves (packages/b-mobile/dist)
npm run build -w @b-oss/b-mobile-pc
npx electron packages/b-mobile-pc       # needs the Electron binary
```

Environment (ignored in a packaged app): `BMPC_DIST` (web build directory), `BMPC_API_ORIGIN` (e.g. a
stub API), `BMPC_AUTH_HOSTS`, `BMPC_AUTH_ALLOW_HTTP=1`, `BMPC_SHELL_VERSION` (the build id the shell reports). On the dev VM the Electron binary has to be
fetched by hand and the app run in Docker; see the e2e issue (b-oss#614).

## Windows exe

**Notifications (toasts) are expected to work from the _installed_ build.** Windows only reliably shows
toasts for an app whose AppUserModelID matches its Start Menu shortcut: the shell sets the id
(`src/main/app-id.ts`, kept equal to `appId` in `electron-builder.json` by a test) and the installer
creates the shortcut. Running the unpacked folder or the portable exe directly has no such shortcut, so
toasts may not appear there (b-oss#674).

### Checking notifications on Windows (b-oss#677)

How the installer ties the two together (read from electron-builder's NSIS template, not guessed): the
NSIS target creates the Start Menu shortcut `b-mobile` (the `productName`) and tags it with
`WinShell::SetLnkAUMI "<shortcut>" "${APP_ID}"`, where `APP_ID` is `appId` from `electron-builder.json`
(`co.salientpoint.b-mobile-pc`); the same call tags the desktop shortcut. The shell calls
`app.setAppUserModelId` with the same string on Windows, before any window exists. So installed and
running ids match. The portable exe and `win-unpacked` never create the shortcut.

To verify on a PC with the installer build:

1. Install with `b-mobile-Setup-<version>.exe` (not the portable exe). Find `b-mobile` in the Start Menu.
2. Settings > Notifications > **Send a test notification**. A toast should appear, and the app log
   gets `toast test: ... show event` and `test notification: ok`. This works without the API or any
   account setting, so it separates "Windows does not show our toasts" from "polling found nothing".
   If it says `failed`, the log has Electron's reason. If it says ok but nothing was seen, look at
   Windows Settings > System > Notifications (is **b-mobile** listed and on?) and Focus Assist / Do
   Not Disturb.
3. Turn a stream on, then read the status line under it ("Checked ... ago · next check in about ...
   minutes · ..."). **Check now** polls at once. The first check only records the starting counts;
   a toast needs something new after it (a comment or star from another account).
4. Optional: in PowerShell, `Get-StartApps | Where-Object Name -eq b-mobile` should list the shortcut
   with AppID `co.salientpoint.b-mobile-pc`. (Written from how Windows lists shortcut AppIDs, not run
   on a PC yet; the app log's start line also prints the id the shell set.)

The app log is `%APPDATA%\b-mobile\logs\app.log` (tray menu: **Open log folder**), one JSON object per
line, redacted. Notification lines have `"source":"notify"`: start-up facts (version, packaged,
AppUserModelID, `Notification.isSupported()`, `net.isOnline()`), the poller starting and stopping, every
poll (account, counts before and after, how long the secure-store read and the request took), every
show / suppress decision, why a poll did not happen (offline, no saved sign-in, backing off), each of
Electron's toast events (`show`, `failed`, `click`, `close`), the tray and login-item state. Never
tokens.

```bash
packages/b-mobile-pc/scripts/build-win-docker.sh
```

Builds b-mobile and the shell, then packages them with electron-builder in the same Wine image b-ark
uses (no Wine on the host). Output in `packages/b-mobile-pc/dist-electron/`: `b-mobile-<version>-portable.exe`
(single file, just run it) and `b-mobile-Setup-<version>.exe` (one-click, per-user installer). Both are
**unsigned**, so SmartScreen warns ("More info", "Run anyway"); signing and auto-update are b-oss#612. The
web build is copied into the app as `resources/web`; `productName` is `b-mobile`, so user data lives in
`%APPDATA%\b-mobile`. A repo-root `.env.local` with `VITE_BLIPFOTO_CLIENT_ID` is needed (baked into the web
build). The packaged layout can be smoke-tested on Linux with `npx electron-builder --linux dir` and the
e2e image (test hooks are ignored when packaged, so only the real API is reachable).

### Fast loop on Windows: run the unpacked build from the synced folder

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

## Dev-loop hazards (b-oss#696)

On 2026-10-31 a day of confusing results came from `resources\app.asar` staying at the previous day's
build while `resources\web` was new: an older instance (tray-resident, and registered to start at login
from the synced folder) held `app.asar` open, so Windows refused the replacement and Mutagen could not
apply it (`mutagen sync list` showed "Transition problems" and "Staging files on beta"). Every later
launch only focused the old process. The new web files then called main-process features the old main did
not have. What now guards against it:

- **Mismatch notice.** The shell reports its own build id through the bridge (`shell.info()`), stamped
  from the same `version.generated.json` as the web build's `__APP_VERSION__` (so a shell and a web build
  made together are equal, e.g. `1.0.2.0.22`). At start-up the web app compares them. If they differ, or
  the shell is too old to report one, a dismissible banner says so ("Quit b-mobile completely (tray icon,
  Exit) and start it again"), an `app.log` line with `"source":"shell-build"` names both, and Help & about
  and "Copy details" show both. Desktop only; nothing changes on Android or the web.
- **No asar in dev builds.** `build-win-docker.sh` (and `npm run dist:win:dev`) pass `asar: false`, so the
  main and preload code is loose files under `resources\app\` that a running instance does not hold open.
  `--asar` (or `BMPC_ASAR=1`) gives the packed form; `npm run dist:win` always does. What this changes for
  packaging: installers made without the asar contain many small files, and they differ from a release
  build in layout only (`app.isPackaged` and every path the shell uses are unchanged, because they are
  relative to `resources\`). For the updater (b-oss#612) a release build should be packed, and the
  differential-update blockmap is per file either way; settle that when #612 picks the release recipe. The
  Electron runtime files (`b-mobile.exe`, the dlls, `resources.pak`) only change on an Electron upgrade.
- **No login item from a dev folder.** Enabling notifications registers the running exe to start at
  login. From a folder with `node_modules` or `.git` within a few levels above it, or with `node_modules`
  or `dist-electron` in its path, the shell logs `login item: left alone (...)` and registers nothing.
  Turning notifications off still clears an item (`src/main/login-item-policy.ts`).

Routine for a new build to land on Windows:

1. Quit b-mobile completely: tray icon > **Exit**, and end any `b-mobile.exe` left in Task Manager.
2. `mutagen sync list`: no "Transition problems"; `mutagen sync flush` if the build has not arrived.
3. Launch. If the mismatch banner appears, an old process is still running: go back to step 1.
4. Do not turn notifications on in the synced folder; test notifications with the Setup-installed copy.

Real Windows behaviour (file locking, the tray, the login item) cannot be tested on the Linux dev VM; the
e2e covers the mismatch banner and log line with a shell started with `BMPC_SHELL_VERSION` (a hook that
is ignored in a packaged app), and the login-item rule is unit-tested as a pure function.

## Testing on Windows (Mutagen dev loop)

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

Not done yet: packaging and signing (b-oss#612), the web-app side of notifications (b-oss#610), the desktop side of
b-mobile's platform layer (b-oss#608 phase 2).
