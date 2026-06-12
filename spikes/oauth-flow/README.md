# Spike #3 — OAuth flow (chrome.identity → Blipfoto)

**Checks the riskiest remaining piece, on which everything else hinges:**

1. Does Blipfoto's app registration **accept the `https://<id>.chromiumapp.org/` redirect**?
2. Does the **implicit-grant** round-trip (`response_type=token`, token in the hash fragment)
   survive `chrome.identity.launchWebAuthFlow`?

Zero-build; inlines the same URL-build / hash-parse logic as `b-api` (already unit-tested),
so this spike isolates the `launchWebAuthFlow` + Blipfoto-redirect mechanics.

## Run it

1. `chrome://extensions` → Developer mode → **Load unpacked** → `spikes/oauth-flow`.
   The page opens on install. **Don't move the folder** afterwards — the extension ID (and
   thus the redirect URI) is derived from the path and must stay stable.
2. Copy the **Redirect URI** shown on the page.
3. Register a **new Blipfoto distributed app** with that exact redirect URI. Note whether the
   form accepts the `chromiumapp.org` URL (report this).
4. Paste the new app's **client_id** into the page and click **Sign in with Blipfoto**.

## Expected

- Chrome's auth window opens on `blipfoto.com/oauth/authorize`; after you authorise it returns
  to the `chromiumapp.org` redirect.
- `✓ access_token received …`
- `SUCCESS ✓ authenticated as "<username>"`.

## What to report back

- Did Blipfoto's registration form **accept the `chromiumapp.org` redirect**? (the key unknown)
- The final log line (`SUCCESS` or any `FAILED` / `error` text, verbatim).

## Production note

For the real `b-ark-chrome`, pin the extension ID with a manifest `key` so the redirect URI is
stable across machines/installs **before** registering the Blipfoto app. This spike relies on
the path-derived unpacked ID, which is stable only on this machine/path.
