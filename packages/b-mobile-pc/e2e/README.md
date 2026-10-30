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

## What it covers

The shell's security posture (CSP, no Node in the page, path traversal, sign-in request validation, denied
permissions), browsing through the API proxy, signing in through the real UI (embedded window, fake
authorize server, redirect capture), the token landing in the secure store and surviving a reload, and
multipart uploads of 0.5, 2.5 and 8 MB.

## What it cannot cover

- **The OS keystore.** A container has no usable one, so the shell is started with
  `BMPC_TEST_PLAINTEXT_STORE=1`, a test hook that is ignored in a packaged app. Whether tokens are really
  encrypted at rest (DPAPI, Keychain, libsecret) and the refusal when they cannot be needs a real
  Windows, macOS or Linux desktop session.
- Windows- or macOS-specific behaviour (installer, protocol registration, tray, updates).
- The real Blipfoto API and a real account.

## Notes from building it

- Electron's postinstall download cannot use a proxy; `run.sh` fetches the zip with `curl`, which can.
- `scrot`/screen captures of Xvfb return stale frames. Use `page.screenshot()` over CDP (these tests do).
- The test hooks live in `src/main/index.ts` behind `!app.isPackaged`: `BMPC_DIST`, `BMPC_API_ORIGIN`,
  `BMPC_AUTH_HOSTS`, `BMPC_AUTH_ALLOW_HTTP`, `BMPC_AUTH_ORIGIN`, `BMPC_TEST_PLAINTEXT_STORE`.
- On the dev VM the image CDN is blocked by the egress allowlist, so photos in the feed do not load;
  nothing here depends on them.
