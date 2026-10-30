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

Not done yet: packaging and signing (b-oss#612), desktop notifications (b-oss#610), the desktop side of
b-mobile's platform layer (b-oss#608 phase 2).
