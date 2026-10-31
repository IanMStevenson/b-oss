# b-mobile-pc end-to-end tests

The real Electron shell, in Docker under a virtual display, driven from the host by Playwright over the
DevTools protocol. It runs against b-mobile's `scripts/stub-api.mjs` (a stand-in for the Blipfoto API,
behind the shell's proxy) and `e2e/fake-authorize.mjs` (a stand-in sign-in page), so it needs no network
access to Blipfoto and no real account.

```bash
npm run e2e -w @b-oss/b-mobile-pc      # Linux + Docker; builds b-mobile and the shell first
```

`e2e/run.sh` does everything: builds the `bmpc-e2e` image once (Ubuntu + the libraries Electron needs),
fetches the Linux Electron binary if `node_modules/electron/dist` is missing, builds the web app and the
shell, starts the stub servers, starts the shell in the container, runs `shell.e2e.ts`, and cleans up.
Screenshots and logs go to `e2e-out/` (git-ignored) or `$BMPC_E2E_OUT`.

**Running several at once** (several workers, or a worker and the coordinator): each run picks its own
container name (`bmpc-e2e-shell-<pid>`) and four free ports (DevTools, stub API, fake sign-in, test
notifications), passes them to the container and to the tests (`BMPC_CDP`, `BMPC_STUB`, `BMPC_NOTIFY`,
`BMPC_E2E_CONTAINER`), and its cleanup removes only its own container and servers. Nothing to configure.
Give runs from the _same_ checkout different `BMPC_E2E_OUT` directories (the default `e2e-out/` is per
checkout). Pin the id or ports with `E2E_ID`, `E2E_CDP_PORT`, `E2E_STUB_PORT`, `E2E_AUTH_PORT`,
`E2E_NOTIFY_PORT` if you need to. A test that needs the container (for example `docker logs`) must use
`process.env.BMPC_E2E_CONTAINER`, never a literal name; likewise ports from the env vars above.

**Variant shells.** `run.sh` can start extra shells (`start_variant <name> <port> -e ...`), each in its own
container with its own user-data directory and DevTools port, for tests that need a shell that is wrong in
one way; their tests live in `variants.e2e.ts` and read `BMPC_CDP_<NAME>` / `BMPC_UD_<NAME>`. Today: `mismatch`
(`BMPC_SHELL_VERSION=e2e-older-shell`, b-oss#696) and `nodist` (`BMPC_DIST` at an empty directory, b-oss#695).

## What it covers

The shell's security posture (CSP, no Node in the page, path traversal, sign-in request validation, denied
permissions), browsing through the API proxy, signing in through the real UI (embedded window, fake
authorize server, redirect capture), the token landing in the secure store and surviving a reload, and
multipart uploads of 0.5, 2.5 and 8 MB.

Desktop notifications by polling (b-oss#610): the shell polls the stub API every second instead of every
five minutes (`BMPC_TEST_POLL_INTERVAL_MS`) and records the notifications it would have shown instead of
showing them (`BMPC_TEST_NOTIFY_PORT`: `GET /shown`, `POST /click/<n>`); the stub's counts and a dead-token
mode are driven over `/__unread` and `/__token-dead`. Covered: enabling is a plain setting (no sign-in
round, no "unavailable" copy), the first poll announces nothing, one notification per rise, none for a
stream switched off and no catch-up when it comes back, a click routes to the right screen, and a dead
token raises exactly one sign-in-again notification.

The error log (b-oss#639): an unhandled page error lands in `userData/logs/app.log` with its token redacted, and the error screen shows the message with Copy details (through the bridge to the clipboard) and Open log folder. The render failure is simulated by handing the app's real error boundary an error through React's fiber tree.

## What it cannot cover

- **The OS keystore.** A container has no usable one, so the shell is started with
  `BMPC_TEST_PLAINTEXT_STORE=1`, a test hook that is ignored in a packaged app. Whether tokens are really
  encrypted at rest (DPAPI, Keychain, libsecret) and the refusal when they cannot be needs a real
  Windows, macOS or Linux desktop session.
- Windows- or macOS-specific behaviour (installer, protocol registration, tray, updates), real OS
  notifications (the harness swaps in a recorder), hide-to-tray on close, the login item and the tray Exit dialog (their decisions are unit-tested in `tray-policy.test.ts`).
- The real Blipfoto API and a real account.

## Notes from building it

- Electron's postinstall download cannot use a proxy; `run.sh` fetches the zip with `curl`, which can.
- `scrot`/screen captures of Xvfb return stale frames. Use `page.screenshot()` over CDP (these tests do).
- The test hooks live in `src/main/index.ts` behind `!app.isPackaged`: `BMPC_DIST`, `BMPC_API_ORIGIN`,
  `BMPC_AUTH_HOSTS`, `BMPC_AUTH_ALLOW_HTTP`, `BMPC_AUTH_ORIGIN`, `BMPC_TEST_PLAINTEXT_STORE`, `BMPC_TEST_POLL_INTERVAL_MS`, `BMPC_TEST_NOTIFY_PORT`.
- On the dev VM the image CDN is blocked by the egress allowlist, so photos in the feed do not load;
  nothing here depends on them.
