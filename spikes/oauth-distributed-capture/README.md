# Spike #3b — distributed OAuth capture inside Chrome

**Why:** the Blipfoto **web-app** flow needs a `client_secret` (passed in the authorize
querystring) that an extension can't keep secret. The **distributed** flow (implicit,
`response_type=token`, no secret) is the only viable option, but it requires a **custom-scheme
redirect** the app "intercepts" to read the token from the **URI fragment**.
`chrome.identity.launchWebAuthFlow` can't do custom schemes (https `chromiumapp.org` only), so
this spike tests the alternative: capture the custom-scheme redirect with observational
`webRequest.onBeforeRedirect` / `webNavigation`, and check whether the **fragment survives**.

## Run it

1. `chrome://extensions` → Developer mode → **Load unpacked** → `spikes/oauth-distributed-capture`.
2. Paste a `client_id` — you can **reuse b-ark's existing distributed app** — and keep the
   default redirect `b-ark://oauth/callback` (it must match what that app has registered).
3. Click **Sign in**. A tab opens on Blipfoto's authorize page; authorise. The extension tries
   to capture the `b-ark://…#access_token=…` redirect and closes the tab.

## Expected outcomes (this is the actual experiment)

- **`SUCCESS ✓ via webRequest.onBeforeRedirect`** (or `via webNavigation`) → the distributed
  flow works in Chrome; that mechanism preserves the fragment. **This is what we're hoping for.**
- **`Captured the redirect … but it carried NO fragment`** → Chrome strips the fragment on that
  path; the token isn't recoverable this way → we need the fallback (a tiny auth proxy that holds
  a web-app secret server-side, or revisit options).
- The **Log** shows what each mechanism actually saw — paste it back along with the Result line.

## Notes

- Reuses b-ark's distributed app for the spike; production would register a dedicated app +
  pin the extension id.
- Listeners run in the service worker; complete the flow promptly so the SW isn't suspended.
