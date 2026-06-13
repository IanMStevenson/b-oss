# b-ark-chrome

A Chrome/Edge (Manifest V3) extension that backs up your Blipfoto journal to a real
folder on disk — the browser-based, single-account _lite_ sibling of the desktop b-ark
app. It shares the same `b-api`, `backup-engine`, and `b-view` packages, so the folder it
writes is byte-for-byte interoperable with desktop b-ark and the b-view journal viewer.

## How it works (architecture in one paragraph)

A draggable **status chip** (content script, shadow DOM) is injected onto `blipfoto.com`.
On a due visit it asks the service worker to open the **backup page** (`backup-page.html`)
as an unfocused background tab. That page runs entirely in the extension origin: it fetches
the Blipfoto API (CORS-bypassed via `host_permissions`), runs the real `backup-engine`
through `BrowserPlatformIO` (File System Access), writes the `entries/YYYY/…` layout to the
chosen folder, and embeds b-view for browsing. The page self-closes on completion unless the
user adopted it. Blocked states (auth expiry, write failure, revoked folder access) turn the
chip **red** and the SW raises the tab — a backup never fails silently. See
[b-ark-chrome-plan.md](./b-ark-chrome-plan.md) for the full design and the de-risking spikes.

## Prerequisites

1. **Register a Blipfoto distributed app** for the extension at
   <https://www.blipfoto.com/developer/apps>, with redirect URI **`bark-chrome://oauth/callback`**.
   Use a _dedicated_ scheme (not `b-ark://`) so an installed desktop b-ark can't intercept
   the OAuth redirect.
2. Put its client_id in the repo-root `.env.local` (vite reads env from the repo root):

   ```
   VITE_CHROME_CLIENT_ID=your_client_id_here
   ```

   Without this, the "Sign in to Blipfoto" button silently does nothing. See
   [`.env.example`](../../.env.example).

## Build

From the repo root:

```bash
npm install
npm run build --workspace=@b-oss/b-ark-chrome   # → packages/b-ark-chrome/dist/
```

`dist/` is the unpacked extension.

## Load unpacked (development)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `packages/b-ark-chrome/dist`.
3. The extension ID is pinned by the manifest `key` and will be:

   ```
   lldojpohcljnehjcmghiefdmbpddfhca
   ```

## Package for distribution

```bash
npm run dist --workspace=@b-oss/b-ark-chrome    # build + package in one step
# or, if dist/ is already built:
npm run package --workspace=@b-oss/b-ark-chrome
```

This produces, in the package root:

- **`b-ark-chrome-<version>.zip`** — upload this to the Chrome Web Store.
- **`b-ark-chrome-<version>.crx`** — a signed CRX3 for self-hosted / drag-to-install
  (only produced when `key.pem` is present).

Both artifacts and `key.pem` are gitignored.

### Signing key & the pinned extension ID

The extension ID is derived from the public key embedded in `manifest.json` as `key`. This
keeps the ID **stable** across rebuilds and machines — important because the Blipfoto app
and any Web Store listing are tied to a specific identity.

The matching **private key** lives in `packages/b-ark-chrome/key.pem` (gitignored — never
commit it). It is needed only to produce a signed `.crx`. If you lose it you can still ship
via the Web Store (which re-signs), but self-hosted CRX updates would break. To regenerate a
keypair (this changes the extension ID, so update `manifest.json` `key` and re-register the
Blipfoto app):

```powershell
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out key.pem
openssl rsa -in key.pem -pubout -outform DER -out pub.der
# base64 of pub.der → manifest.json "key"; the package script prints the new ext-id
```

## Manifest permissions

| Permission                   | Why                                                           |
| ---------------------------- | ------------------------------------------------------------- |
| `storage`                    | settings, status, encrypted token ciphertext, chip position   |
| `webRequest`                 | capture the OAuth custom-scheme redirect (`onBeforeRedirect`) |
| `webNavigation`              | secondary OAuth redirect capture                              |
| `tabs`                       | open/raise/close the backup page tab                          |
| `https://api.blipfoto.com/*` | Blipfoto API fetch                                            |
| `https://*.cloudfront.net/*` | image CDN (CloudFront subdomains rotate → wildcard)           |
| `https://*.blipfoto.com/*`   | content-script (chip) match + OAuth redirect capture          |

## Quality gates

From the repo root: `npm run typecheck`, `npm run lint`, `npm test` must all be green.
