# b-oss Working Document

## Status

Working!

## TODO

## Bugs

Vite 8 deprecation warnings in b-view build — esbuild plugin option deprecated → migrate to oxc; optimizeDeps.esbuildOptions deprecated → migrate to optimizeDeps.rolldownOptions. Vite 9 will break these.

Invalid esbuild version constraint — vite@8 wants esbuild ^0.27.0 || ^0.28.0; electron-vite@5.0.0 pins esbuild ^0.25.11 and the older version hoists. Builds work, mismatch is cosmetic for now. Unblock by upgrading to electron-vite@6 once it goes stable (currently beta).
react / react-dom peer warnings — lucide-react and @testing-library/react show as missing peers at the root level despite being satisfied per-workspace. Decided to live with; revisit if it ever blocks anything.

electron-builder v26 → v27 upgrade — --publish always is now in place, so the breaking change in v27 is pre-empted. Upgrade itself is still future work.

There are also 3 security alerts in electron build related modules - none of which apply to our circumstances and none of which have fixes that don't break things even more.

## API Limitations

**Image URLs** — `hires` and `original` fields in `image_urls` come back null in practice despite the user uploading original-resolution images. Needs investigation/fix on the Blipfoto side. **These fields are only populated for trusted apps - how do I get trusted**

**Extra images** — Supplementary photos attached to an entry are not exposed by the API at all (no read or upload endpoint). Website-only feature. **There is an undocumented API for extras**

**CORS** — The Blipfoto API returns no `Access-Control-Allow-Origin` headers, so browser-based `fetch()` calls are blocked by CORS policy. Direct browser access is not possible. Workarounds: (a) a thin server-side proxy that forwards requests and injects the header; (b) on Capacitor/mobile, use `@capacitor/http` which routes through native Android/iOS HTTP and is not subject to CORS. Worth raising with Blipfoto as a simple server-config change on their side. **There is a JSONP mechanism on their side that can handle GETs, doesn't work for POST/PUT/DELETE - but it's horrible - they should fix this**

**Notifications** — No push/event mechanism; polling is the only option. Two approaches to raise with Blipfoto:

- _Webhooks (preferred ask)_ — App registers a callback URL + event types; Blipfoto POSTs a signed payload when events fire (new comment, follower, notification, etc.). Platform-neutral, low burden on Blipfoto, no polling needed. Cloud service receives webhook and forwards to FCM/APNs.
- _Native push token registration_ — App registers its FCM/APNs token via the API; Blipfoto delivers push notifications directly. Better end-user experience but requires Blipfoto to maintain FCM and APNs credentials.
- _Token downscoping (fallback ask)_ — An API endpoint that accepts a `read,write` user token and issues a scoped-down `read`-only token. Removes the need for a second OAuth flow when handing a polling credential to a cloud service; the app authenticates once and derives the restricted token itself.

**Notifications ARE in blipfoto, but only for their own apps. Could open up AWS SNS to other app developers, or eliminate AWS dependency with WebHook - completely generic**

## Key Commands

**Rebuild Everything**
npm run build

**Run b-ark in dev mode**
npm run dev --workspace=packages/b-ark
