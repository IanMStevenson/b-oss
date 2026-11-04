# b-ark — Microsoft Store content

Source of truth for the text pasted into Partner Center, so what is published can be
reproduced and updated. Tracked in
[b-oss#805](https://github.com/IanMStevenson/b-oss/issues/805). Limits are the ones
Partner Center states for each field. Screenshots live in `screenshots/` beside this file and
are uploaded directly.

Run `node scripts/check-store-listing.mjs` (repo root) after any edit: it reads the fenced
blocks under the headings below and fails if a limit is exceeded. Keep each field's text in
the first fenced block under its heading.

---

## Submission options → restricted capability: `runFullTrust`

"Why do you need the runFullTrust capability, and how will it be used in your product?"

The box cuts the text off at roughly 500 characters, so keep this under 450.

```
b-ark is an Electron desktop app (Chromium and Node.js), a Win32 program that cannot run in the AppContainer sandbox. Full trust lets it write the user's backup to a folder they choose anywhere on their PC, run a tray icon and scheduled background backups, start at sign-in, and encrypt the Blipfoto access token with Windows' credential protection. It runs unelevated and installs no services. Open source: github.com/IanMStevenson/b-oss
```

## Store listing (English)

Product name: **b-ark** (reserved name; identity `IanStevenson.b-ark`)

### Short description (recommended under 270 characters)

```
Back up your Blipfoto journal, entries and photos, to a folder on your own PC, automatically and in the background. An independent, open-source tool.
```

### Description (plain text, up to 10,000 characters; no HTML, code or URLs)

```
b-ark keeps a complete copy of your Blipfoto journal on your own PC.

Sign in with your Blipfoto account, choose a folder, and b-ark downloads every entry: the photo, title, description, tags, comments and details. After that it keeps your copy up to date on a schedule you set, quietly in the background, so posts you make from your phone are backed up too. b-ark can start with Windows. [IAN TO CONFIRM once the startup-at-sign-in change lands]

Backup
- Downloads your entries and their images into a folder you choose, anywhere on your PC, including a cloud-synced folder.
- Runs automatically daily, weekly or monthly at the time you pick. If the PC was off at the scheduled time, the backup runs when b-ark next starts.
- Each run also checks recent days for anything missed and re-downloads your latest entries, so edited captions and new comments are picked up.
- If Blipfoto limits how fast entries can be fetched, b-ark pauses, counts down and carries on by itself. A first backup of a large journal can take a while.
- Optionally saves original-size and hi-res images, and an entry's extra images, where they are available. This is off by default.

Several journals, one app
- Add more than one Blipfoto account and back them all up on one shared schedule.
- Each journal shows its own status at a glance: up to date, needs attention, or an error with a plain explanation and a button to put it right.

Runs quietly
- Lives in the system tray with a colour-coded status icon. Closing the window leaves b-ark running so scheduled backups still happen; use Exit in the tray menu to quit.
- Shows a notification if a backup fails.
- A log of what each backup did is kept, and can be exported as a CSV file.

Browse your journal
- A built-in viewer shows your backup as a thumbnail grid, with a full entry view: photo, title, description, tags, comments, views, stars, location and camera details.
- Search your entries, jump to a date, and open a full-screen photo.
- Open the same viewer in your web browser, or open the index page inside the backup folder from anywhere. Copy the folder to any web host if you want to publish it.

Your data stays yours
- Backups are ordinary files in ordinary folders (JSON and JPEG), organised by year and date.
- Settings live in the backup folder, so they follow it if you move to another PC.
- Each backup folder includes a README written for AI assistants, to help you build photo books, slideshows or statistics from your journal if you wish.
- Your sign-in token is encrypted using Windows' own secure storage. b-ark has no analytics, no crash reporting and no server of its own, and nothing is sent to the b-ark project.

About
b-ark is a free, open-source tool from the b-oss project. It is independent and unofficial: it is not made, endorsed or supported by Blipfoto. It uses Blipfoto's public programming interface to read your own journal. You need a Blipfoto account to use it. Updates come through the Microsoft Store.
```

Claims above were checked against the code, the UI and the user guide (viewer search, date jump, full-screen photo, tray menu, failure notification, CSV log export, optional original/hi-res setting, overdue backup on start). Before pasting into Partner Center, remove the bracketed marker and run `STORE_LISTING_FINAL=1 node scripts/check-store-listing.mjs`, which fails while any `IAN TO CONFIRM` marker remains.

### Product features (up to 20, each up to 200 characters; one per line, no bullets: the Store adds them)

```
Automatic scheduled backups of your Blipfoto journal, daily, weekly or monthly
Back up several Blipfoto journals on one shared schedule
Saves every entry: photo, title, description, tags, comments and details
Built-in viewer with thumbnail grid, full entry view and search
Runs in the system tray with a colour-coded status icon
Can start with Windows
Choose any backup folder, including a cloud-synced one
Settings are stored in the backup folder and follow it between PCs
Optionally saves original-size and hi-res images where available
Backups are plain JSON and JPEG files, with a README for AI assistants
Sign-in token encrypted with Windows secure storage; no analytics
Free, open-source and independent of Blipfoto
```

### What's new in this version

Leave blank for the first submission.

### Notes for certification testers

Partner Center's "Notes for certification" field. Its character limit was not confirmed
from Microsoft's docs; the checker holds this to 1,500 characters to be safe.

```
b-ark backs up a user's own Blipfoto journal, so it needs a Blipfoto account and an internet connection; without one only the empty welcome screens are visible. [IAN TO CONFIRM: test-account details, if any, go in this field in Partner Center only, never in this repository.]

What to expect: on first launch b-ark asks for a backup folder (any empty folder). "Add account" opens the default browser on Blipfoto's authorisation page; after approving, the browser hands back to b-ark through its b-ark:// link and the journal appears in the sidebar. "Backup now" then downloads entries; thumbnails appear as they arrive and a progress banner shows the phase. The gear icon opens settings (schedule, folder, delay). Closing the window hides b-ark to the system tray; Exit in the tray menu quits it.

No other sign-in, purchase, advertising or network service is involved. Everything is written to the chosen folder. The restricted capability runFullTrust is needed because b-ark is an Electron (Win32) desktop app that must write to a folder the user picks anywhere on the PC, run a tray icon and scheduled backups, and use Windows credential protection for the token; it runs unelevated and installs no services.
```

### Category and ratings (suggestions; confirm against the Partner Center dropdowns)

- Category: Productivity (alternative: Utilities & tools; Photo & video is a poor fit, the app archives and views rather than edits). Not confirmed against the live list.
- Age rating: complete the IARC questionnaire as a utility with no user-generated content *created in the app*, no chat, no in-app purchases, no ads, no violence, sexual content, gambling or location sharing. Caveat for Ian to decide: the viewer shows the user's own downloaded journal content (photos and comments by Blipfoto users), so answer the user-generated-content question the way the form's wording requires; the app itself does not host or share it. Expect a low rating (3+/Everyone) but let the questionnaire decide.
- Pricing: free. Markets: all.
- Support contact / website: https://b-oss.dev/b-ark (Ian to confirm the support email to enter).

### Privacy policy URL (its own field, not part of the description)

```
https://b-oss.dev/b-ark-privacy
```

Checked against the site source on 2026-11-04 (see the PR for findings).

### Screenshots

Uploaded in Partner Center, from `screenshots/`: PNG, 1366x768 or larger (up to 3840x2160), up to
10 per listing, 4 recommended. Synthetic fixture and made-up account names; see the PR for how
they were produced.

| File | Size | Shows |
| --- | --- | --- |
| `1-accounts-main.png` | 1920x1080 | Three journals in the sidebar, thumbnail grid, status bar |
| `2-backup-in-progress.png` | 1920x1080 | A backup running: phase banner and progress |
| `3-built-in-viewer.png` | 1920x1080 | An entry open in the built-in viewer |
| `4-settings.png` | 1600x880 | Settings: folder, schedule, delay, gap check, redo |

### Still needed

- Store logos and trailer are optional; none made.
- Confirm the "can start with Windows" sentence once the startup-task work lands, then remove the markers.
