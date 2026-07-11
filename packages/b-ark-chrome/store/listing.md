# b-ark-chrome — Chrome Web Store listing copy

Source-of-truth for the text fields you paste into the Chrome Web Store Developer
Dashboard. Keep this in sync with what's published so future updates (and any later
API-driven automation) reuse the same copy.

Image assets (screenshots, small promo tile) live alongside this file in
`packages/b-ark-chrome/store/`. They are **not** web-published — they're uploaded directly
in the dashboard. Only the privacy policy is hosted (via `docs/` GitHub Pages).

---

## Store listing tab

### Item name (≤ 75 chars)

b-ark — Blipfoto Backup for Chrome

### Summary / short description (≤ 132 chars)

<!-- Manifest description is the starting point. Suggestion: -->

Back up your Blipfoto journal — entries and images — to a folder on your own computer.

### Category

Productivity

### Language

English

### Detailed description (≤ 16,000 chars)

<!--
Start with one concise sentence of what it does, then features and how it works.
Avoid keyword spam. Draft below — edit to taste before submitting.
-->

b-ark backs up your Blipfoto journal to a folder you choose on your own computer.

b-ark is easy to install and works inside the Chrome browser. It backs up when you visit
blipfoto, either at regular intervals or when you upload (or modify) journal entries.

You sign in with your Blipfoto account, pick a destination folder, and b-ark downloads
your entries and their images — keeping your backup in step with your journal over time.

Features

- Backup. A local copy of every blip, updated automatically.
- Original images. Optionally download the full-resolution original upload and any extra images attached to an entry (requires Blipfoto subscription for originals; must be signed in to Blipfoto in Chrome).
- View. Browse your archive offline in the built-in viewer, including extra images.
- Publish. Copy the backup folder to any web host to publish.
- AI-ready. README.md for AI tools: Use AI to build photobooks, slideshows, statistics, custom sites.
- Everything is stored on your own computer - nothing is uploaded to any third-party
- An optional on-page status chip shows backup state while you browse Blipfoto.
- One-click sign-in with your Blipfoto account.

Privacy

- Your backup is written only to the folder you pick, using your browser's File System
  Access API. b-ark does not run its own servers and collects no analytics.
- Your sign-in token is encrypted at rest on your device.
- Full privacy policy: https://ianmstevenson.github.io/b-oss/b-ark-chrome-privacy.html

b-ark is an open source project from b-oss and is not affiliated with Blipfoto.

---

## Privacy tab

### Single purpose

Backs up a user's own Blipfoto journal (entries and images) to a local folder they choose.

### Privacy policy URL

https://ianmstevenson.github.io/b-oss/b-ark-chrome-privacy.html

### Permission justifications

Paste one entry per permission field in the dashboard. Each is under 1000 characters.

**storage**
b-ark uses chrome.storage.local to share state between three separate browser contexts: the background service worker, the on-page status chip (a content script), and the backup page. All three must stay in sync and react to each other's changes. chrome.storage.local is the only API reachable from all three contexts that also fires cross-context change events, which the chip and backup page listen to for live status updates. It also stores the user's settings and holds the user's encrypted OAuth token (AES-GCM encrypted; the decryption key lives in IndexedDB and never touches storage). No alternative API provides both cross-context access and change notifications.

**webRequest**
b-ark signs in the user via Blipfoto's OAuth flow. Blipfoto's server requires a custom-scheme redirect URI (bark-chrome://) for distributed apps — it explicitly rejects standard https:// redirects, so chrome.identity.launchWebAuthFlow cannot be used. When the sign-in completes, Blipfoto issues a redirect to bark-chrome://oauth/callback with the access token in the URL fragment. webRequest.onBeforeRedirect is the only browser API that can intercept this redirect and read the token from the fragment before the browser discards it. The listener is read-only (non-blocking), scoped only to \*.blipfoto.com, active only during a sign-in attempt, and removed immediately on completion or timeout.

**Host permissions (all five URLs — paste as one block)**
b-ark needs five host permissions to back up a Blipfoto journal. api.blipfoto.com is the Blipfoto REST API used to list and download journal entries. _.blipfoto.com covers the on-page status chip and publish-watcher content scripts (which run on Blipfoto pages), the OAuth sign-in flow, and — when the user enables the optional original-image download feature — fetching entry pages to extract full-resolution image URLs using the user's existing browser session. _.cloudfront.net is required to download entry images: Blipfoto serves images via multiple CloudFront distributions whose hostnames are assigned by AWS and are only known at runtime from API responses — they cannot be hardcoded. s3.eu-west-1.amazonaws.com and \*.s3.eu-west-1.amazonaws.com are both required for original-resolution images: Blipfoto serves these as short-lived presigned S3 URLs, using either path-style or subdomain-style S3 addressing depending on the bucket. All requests are made only to URLs supplied by the Blipfoto API or Blipfoto page content; no speculative or unrelated requests are made to any of these hosts.

### Data usage declarations

- Collected: authentication info (the encrypted OAuth token) and the user's own journal
  content (entries + images), written only to the user-chosen local folder.
- Certify: not sold or transferred to third parties; not used for purposes unrelated to
  the single purpose above; not used for creditworthiness / lending.

---

## Distribution tab

- Visibility: **Unlisted** for the 0.9.0 beta; flip to **Public** when stable.
- Regions: all (no regional restriction).

---

## Assets checklist (this folder)

- [ ] `screenshot-*.png` — 1–5 at 1280×800 (DevTools Device Mode, DPR 1)
- [ ] `promo-small.png` — 440×280 small promo tile
- [ ] (optional, skipped for beta) `promo-marquee.png` — 1400×560
