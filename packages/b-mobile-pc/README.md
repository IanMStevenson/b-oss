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
| `src/main/index.ts`, `auth-window.ts` | Electron wiring (not unit-tested; covered by the e2e harness, b-oss#614)                     |
| `src/preload/index.ts`                | Exposes `window.bMobileDesktop` (`src/shared/bridge.ts` is the contract)                     |

b-mobile holds a matching copy of the bridge types in its platform layer, because it must not depend on
this package.

## Running it

```bash
npm run build -w @b-oss/b-mobile        # the web build this shell serves (packages/b-mobile/dist)
npm run build -w @b-oss/b-mobile-pc
npx electron packages/b-mobile-pc       # needs the Electron binary
```

Environment (ignored in a packaged app): `BMPC_DIST` (web build directory), `BMPC_API_ORIGIN` (e.g. a
stub API), `BMPC_AUTH_HOSTS`, `BMPC_AUTH_ALLOW_HTTP=1`. On the dev VM the Electron binary has to be
fetched by hand and the app run in Docker; see the e2e issue (b-oss#614).

## Testing on Windows (Mutagen dev loop)

Same two-hop pattern as b-ark (`devutils/dev-vm-setup/mutagen-dev-loop-pattern.md`): a VM-only relay
mirrors a worktree into a stable staging folder, and a cross-machine session mirrors that to Windows.

On the VM (done; this is the part the agent can do):

```bash
# relay: b-mobile-pc-relay  ->  ~/live/b-mobile-pc-repo   (whole repo, so VS Code on Windows has the workspace)
mutagen sync terminate b-mobile-pc-relay
mutagen sync create --name=b-mobile-pc-relay --sync-mode=one-way-replica \
  --ignore-vcs --ignore=node_modules/ --ignore=e2e-out/ \
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

Not done yet: packaging and signing (b-oss#612), desktop notifications (b-oss#610), the desktop side of
b-mobile's platform layer (b-oss#608 phase 2).
