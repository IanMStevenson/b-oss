# b-oss Working Document

## Status

Working!

## TODO

Update b-oss website

- Add provisional link for mac version
- draft content for b-ark-chrome vs. b-ark

## Bugs

Invalid esbuild version constraint — vite@8 wants esbuild ^0.27.0 || ^0.28.0; electron-vite@5.0.0 pins esbuild ^0.25.11 and the older version hoists. Builds work, mismatch is cosmetic for now. Unblock by upgrading to electron-vite@6 once it goes stable (v6.0.0-beta.1 as of 2026-07-15, no stable yet).
react / react-dom peer warnings — lucide-react and @testing-library/react show as missing peers at the root level despite being satisfied per-workspace. Decided to live with; revisit if it ever blocks anything.

electron-builder v26 → v27 upgrade — --publish always is now in place, so the breaking change in v27 is pre-empted. Upgrade itself is still future work.

3 high-severity dev-only security alerts — all from the chain `electron-vite@5 → vite@7.3.3 → old esbuild`. esbuild is a build-time dependency only and never ships in the app, so there is no user-facing exposure. The only resolution is electron-vite@6 — still beta-only (6.0.0-beta.1, no stable as of 2026-07-15). Holding for 6.0.0 stable; revisit then. The same electron-vite 6 upgrade also unblocks the deferred minor-and-patch Dependabot group (electron 42.4+, etc.), which can't apply while electron-vite 5 pins the tree to vite 7.

Dependency-update branch `chore/deps-update-1.0.2` — validated clean (typecheck/lint/test/build all green) for the four bumps that do NOT depend on electron-vite 6: typescript 5.9→6.0 (needed `@types/node` declared + `types:["node"]` in backup-engine; TS 6 dropped implicit @types inclusion), electron-store 10→11 (build-bundled; runtime config/token migration still needs a GUI install-over-existing-data check), uuid 11→14, lint-staged 15→17 (pre-commit hook verified). Not yet merged to main.

## API Limitations

**Image URLs** — `hires` and `original` fields in `image_urls` come back null in practice despite the user uploading original-resolution images. Needs investigation/fix on the Blipfoto side. **These fields are only populated for trusted apps - how do I get trusted**

**Extra images** — Supplementary photos attached to an entry are not exposed by the API at all (no read or upload endpoint). Website-only feature. **There is an undocumented API for extra - only for trusted apps again**

**CORS** — The Blipfoto API returns no `Access-Control-Allow-Origin` headers, so browser-based `fetch()` calls are blocked by CORS policy. Direct browser access is not possible. Workarounds: (a) a thin server-side proxy that forwards requests and injects the header; (b) on Capacitor/mobile, use `@capacitor/http` which routes through native Android/iOS HTTP and is not subject to CORS. Worth raising with Blipfoto as a simple server-config change on their side. **There is a JSONP mechanism on their side that can handle GETs, doesn't work for POST/PUT/DELETE - but it's horrible - they should fix this**

**Notifications** — No push/event mechanism; polling is the only option. Two approaches to raise with Blipfoto:

- _Webhooks (preferred ask)_ — App registers a callback URL + event types; Blipfoto POSTs a signed payload when events fire (new comment, follower, notification, etc.). Platform-neutral, low burden on Blipfoto, no polling needed. Cloud service receives webhook and forwards to FCM/APNs.
- _Native push token registration_ — App registers its FCM/APNs token via the API; Blipfoto delivers push notifications directly. Better end-user experience but requires Blipfoto to maintain FCM and APNs credentials.
- _Token downscoping (fallback ask)_ — An API endpoint that accepts a `read,write` user token and issues a scoped-down `read`-only token. Removes the need for a second OAuth flow when handing a polling credential to a cloud service; the app authenticates once and derives the restricted token itself.

** OAuth Redirect ** - Modern Chrome plugins are designed to use a redirect to" https://<id>.chromiumapp.org/". This would need to be added as a valid URL format for Distributed apps. Not any https:// option - specifically the restricted chromoiumapp.org domain.

## Key Commands

**Rebuild Everything**
npm run build

**Run b-ark in dev mode**
npm run dev --workspace=packages/b-ark

## b-ark-chrome todos

Original/Extra image backup and thumbnail-display-during-backup fixes merged. Live with it and test it thoroughly.

Consider release options once happy/stable - straight to chrome store?
