# b-mobile headless emulator rig

Automates the device checks the Playwright web harness cannot see, on a headless Android emulator
([b-oss#796](https://github.com/IanMStevenson/b-oss/issues/796)). It drives the real Capacitor
WebView over CDP and uses `adb shell` for system actions. No phone is involved: every adb call is
pinned to the emulator serial (`emulator-5554`, override `EMU_SERIAL`/`EMU_PORT`).

| File                         | What                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| `emu.sh`                     | `setup` (install emulator + image, create AVD), `start`, `stop`, `status` |
| `run-checks.mjs`             | The checks; writes `results.json` and screenshots                         |
| `lib.mjs`                    | adb helpers and a minimal CDP client                                      |
| `build-sender.sh`, `sender/` | A tiny test "gallery" APK that shares an image with a URI grant           |

## Prerequisites

- `/dev/kvm` readable by your user (group `kvm`: `sudo usermod -aG kvm $USER`, then a new login).
- Android SDK at `~/Android/Sdk` (`ANDROID_HOME`) with cmdline-tools, build-tools, a platform, JDK 17+, Node 22+ (built-in `WebSocket`).
- On the egress-controlled dev VMs, SDK downloads go through the squid proxy; `emu.sh setup`
  passes the proxy to the JVM and retries on the rate-limit `403`s. First run downloads ~2 GB.

## Run

```bash
cd packages/b-mobile/scripts/emulator
./emu.sh setup && ./emu.sh start              # boots in ~75 s cold

# debug APKs: build each branch in its own worktree (see the root CLAUDE.md, "Debug build beside the Play build")
#   npm run build:android-debug -w @b-oss/b-mobile && (cd packages/b-mobile && npx cap sync android) \
#     && (cd packages/b-mobile/android && ./gradlew assembleDebug --max-workers=2)
./build-sender.sh /tmp/emu/sender.apk
node run-checks.mjs --main /tmp/emu/main.apk --integ /tmp/emu/integ.apk --sender /tmp/emu/sender.apk --out /tmp/emu/results
# one check only: --only update | start | links | share | back | resume | offline
./emu.sh stop
```

Exit status is non-zero only for `FAIL`. `WARN` marks a known finding the rig records without
failing (see below). The two APKs can be any two builds: "main" is the old build installed first,
"integ" is the one installed over it.

## What it checks

| Check                            | How                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update`                         | Install old build, seed accounts/device prefs and a fake secure-storage token through the app's own plugins, `install -r` the new build over it, compare the on-disk prefs files and read everything back (prefs, token, account in the menu, dark theme)                                                                                                                                                  |
| `start`                          | Cold start with cleared data reaches Browse, no console errors                                                                                                                                                                                                                                                                                                                                             |
| `links`                          | `bmobile-debug://entry/…` and `user/…` cold and warm; malformed escape ignored; `https://www.blipfoto.com/…` not handled by default, handled after opting in (via the preference, as a user does)                                                                                                                                                                                                          |
| `share`                          | Sender APK shares a PNG with a read grant, cold and warm; expects `/compose`                                                                                                                                                                                                                                                                                                                               |
| `back`                           | Back on Browse is swallowed; Back from Map, Search, Settings and Help returns to Browse; Back with the menu open closes it                                                                                                                                                                                                                                                                                 |
| `resume`                         | Background 4 s and resume keeps the screen; kill in background and relaunch starts cleanly                                                                                                                                                                                                                                                                                                                 |
| `oauth` (opt-in, `--only oauth`) | Real sign-in with the owner's own test account through the in-app WebView: fills the login form, approves, checks the app returns signed in with a stored token. Needs `~/.config/b-mobile/emulator-account.env` (`BLIPFOTO_USER`, `BLIPFOTO_PASSWORD`, mode 600), read only from that file; never printed, logged, screenshotted or written to results. One login per run; skipped if the file is missing |
| `offline`                        | Airplane mode (`cmd connectivity airplane-mode`) shows "You seem to be offline"; restoring it clears that                                                                                                                                                                                                                                                                                                  |

The default checks seed a made-up token and account and use no real account. Only the opt-in
`oauth` check uses a real test account, and no credential or token value is logged or stored in results.

### Reaching Blipfoto (for `oauth`, or to see real feeds)

By default the emulator has no route out, so feeds show "can't reach Blipfoto". To go through the
dev-box squid proxy, after `emu.sh start` run
`adb -s emulator-5554 shell settings put global http_proxy 10.0.2.2:3128` (and
`... settings put global http_proxy :0` to undo). Images from CDNs the proxy does not allow still
fail, which the rig treats as known noise. The default checks do not need this (the offline check
expects the unreachable baseline).

## Cost

Measured on the dev VM (15 GB RAM, 2 vCPU emulator, API 35 `google_apis` x86_64):
full run of all checks about 2m40s after boot; emulator peak about 4.3 GB RSS (one at a time);
cold boot about 75 s; first-time `setup` about 20 min through the proxy.

## Limits (what it cannot do)

- **No route to Blipfoto by default** (see above); the native API base is fixed to `api.blipfoto.com`, so there is no stub switch. FCM push and anything needing real account data beyond sign-in are not covered and stay manual.
- **The emulator WebView is old (124).** On it `new URL('bmobile-debug://entry/1').host` is empty, so
  custom-scheme links reach the app (asserted) but the resolver cannot route them: recorded as
  `WARN`. Phones with a current WebView are not affected by the emulator's version; the rig cannot
  show which WebView versions are.
- `am start` cannot grant MediaStore URIs, hence the sender APK.
- A scripted click on a side-menu item leaves the menu open (a real tap closes it), so `back`
  closes the menu through its API before pressing Back.
- Known harmless console noise is filtered and listed in `run-checks.mjs` (`favicon.ico` 404,
  "Error injecting safe area CSS", map tiles with no route).
- Playwright `connectOverCDP` does not work against Android WebView (it rejects
  `Browser.setDownloadBehavior`), hence the small raw-CDP client in `lib.mjs`.
