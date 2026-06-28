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
- View. Browse your archive offline in the built-in viewer.
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

See `packages/b-ark-chrome/chrome-permissions.md` for the full reviewer-facing
justification of every permission and host permission, plus the one-line summary table
to paste into the form. Covers: `storage`, `webRequest`, and the four host permissions
(`api.blipfoto.com`, `*.blipfoto.com`, `*.cloudfront.net`, `s3.eu-west-1.amazonaws.com`).

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
