# Option C — end-to-end proof

**Proves the last technical unknown:** a single extension page can **fetch the Blipfoto API**
(cross-origin, CORS-bypassed via `host_permissions`) _and_ **write** the entry JSON + a
downloaded image to a real on-disk folder via the **File System Access API**, in one context.
That is the whole basis of the Option C execution model.

This is **Step A**: vanilla / zero-build, using raw `fetch` + raw FSA (no bundler in the way).
Step B will repeat the flow driven by the real `b-api` + `backup-engine` packages.

## Run it

1. Get a Blipfoto **access token** (e.g. from the desktop b-ark, or any token for your account).
2. `chrome://extensions` → Developer mode → **Load unpacked** → `spikes/option-c-e2e`.
   The proof page opens on install (or click the toolbar icon).
3. Paste the token, click **1 · Pick backup folder** (a throwaway folder), then
   **2 · Run proof**.

## Expected

- `GET user/profile → 200` — confirms CORS-bypass fetch of the API from the extension page.
- `wrote entries/YYYY/YYYY-MM-DD.json` — confirms FSA write (nested dirs, real layout).
- `downloading image from CDN host: …` + `wrote …-o.jpg` — confirms a cross-origin image
  download **and** its bytes written to disk in the same context.
- `>>> IMAGE CDN HOST to pin in host_permissions: …` — **report this host back**; it pins
  spike #2 (the production `host_permissions` list).
- `SUCCESS ✓`

## Notes

- `host_permissions` is `https://*/*` here so the unknown image CDN host is covered; production
  will narrow it to `api.blipfoto.com` + the CDN host this proof reveals.
- The token lives only in the tab's `sessionStorage` — never written to any file.
