# Changelog

All notable changes to b-oss will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [b-mobile 1.5.2] - 2026-11-12

### Changed

- b-mobile: blipfoto.com links in notification text, comments, entry text and bios open inside the app (entries, follow requests, and profiles via a bare `/name` path); anything else, or a profile that can't be looked up, still opens in the browser (b-oss#1002).
- b-mobile: the thumbnail picker looks like the website's: tap the whole thumbnail ("Choose thumbnail"), then Cancel or Use thumbnail; Cancel now discards the drag (b-oss#1007).
- b-mobile: the read-only account's "Switch to read-write" prompt starts the read-write conversion directly and returns to the screen you were trying to reach (b-oss#1009).
- b-mobile: opening a profile from another page lands on the Entries tab instead of About.

### Fixed

- b-mobile: opening a member from Followers/Following refreshes the whole profile instead of keeping the previous member's tab and list (b-oss#1005).
- b-mobile-pc: when the Store starts it at sign-in, it now stays hidden in the tray; the launch kind is read before anything else uses the add-on, and logged (b-oss#1011).

## [b-mobile 1.5.1] - 2026-11-10

### Changed

- b-mobile: a photo picked from the gallery sets the entry date from the photo's EXIF date when it has a valid one (a zeroed date is ignored), and on Android falls back to the original file's modified time (b-oss#989, b-oss#992). b-mobile-pc 1.5.1 carries this change; the landscape fix below was seen only on Android.

### Fixed

- b-mobile: the photo now respects Fit to screen and Compact in landscape; it is capped by the real scroller, not the page height (b-oss#991).

## [1.0.10] - 2026-11-09

### Fixed

- b-ark: the initial "Choose folder" button can no longer open more than one folder picker; a second click while one is open does nothing. This also removes a first-time sign-in error (`EPERM … b-ark-settings.tmp`) seen after two pickers were confirmed (b-oss#983).

### Changed

- b-ark: error messages (toasts) stay until dismissed, other messages fade after 30 s instead of 5 s, hovering a message pauses it, and errors are also written to the backup folder's log (b-oss#985). b-ark-chrome's code shares the toast change, but b-ark-chrome is not published at 1.0.10.

## [1.0.9] - 2026-11-08

### Changed

- b-ark, b-ark-chrome: the photo viewer (lightbox) zooms more predictably: a sensible keyboard zoom step, panning only when zoomed in, no jump at fit size, and zooming out at fit does nothing (b-oss#953, b-oss#956).
- b-ark, b-ark-chrome: one fixed 100 ms pause between API fetches. The b-ark Delay setting is removed, and an old `api_delay_ms` in a settings file is ignored (b-oss#920).
- CI: a `b-ark-v*` tag builds the b-ark Store MSIX and the b-ark-chrome zip from one Environment (`release-b-ark.yml`). The GitHub installer, Mac test and sideload workflows are removed (b-oss#945).

## [b-mobile 1.5.0] - 2026-11-08

### Added

- b-mobile: an entry's extra photos show as thumbnails in the entry view and in one full-screen gallery, at standard size, read from the public entry page. The gallery stays within the entry; it no longer moves on to adjacent entries.
- b-mobile: change an entry's date in the entry editor.
- b-mobile: keyboard support: Ctrl+arrows on the grid-navigation bar, Backspace for back, a focus ring on grids, editor shortcuts, and a keyboard guide.
- b-mobile: a Compact photo size, and Fit to screen now allows for the top bar.
- b-mobile: the full-screen photo zooms by a sensible keyboard step and pans only when zoomed.

### Changed

- b-mobile-pc 1.5.0: Store update after the live 1.4.0. An entry's extra photos show in the entry view and one full-screen gallery (the shell now proxies blipfoto.com entry pages on `/site/blipfoto/`); the full-screen photo is drawn above the app's layout so it can't be clipped, with a sensible keyboard zoom step; and it starts hidden when launched by the Store's start-at-sign-in task.
- b-mobile: turning on "Open blipfoto.com links in this app" sends you to Android's Open by default settings; declining the approval turns the toggle back off, and the help text mentions the Android 12+ approval.
- b-mobile: the full-screen photo is drawn above the app's own layout so it can't be clipped.

## [b-mobile 1.3.0] - 2026-11-05

### Added

- b-mobile: opening an entry from a browse, search, tag or Faves grid shows a bar at the bottom to step through that grid (swipe it, or use the arrows). Tap the caption for where you came from, hide it, or turn it off in Settings > Appearance.
- b-mobile: tap a profile picture to view it full size. Profile pictures are now square throughout, apart from the round account button in the header.

### Fixed

- b-mobile: the Notifications and Comments lists refresh when you come back to the app.
- b-mobile: the thumbnail on the publish-complete screen is centred.

## [1.0.7] - 2026-11-07

### Added

- b-ark: available from the Microsoft Store. Store installs are updated by the Store.
- b-ark: GitHub-installer builds show a launch notice that b-ark is now on the Microsoft Store, with a button to get it, a "How it works" link, Dismiss (until next launch) and "Remind me later" (hides it for 14 days). The Store build never shows it.
- b-ark: a new "Warn if scheduled backups stop" setting, part of Scheduled backups. If b-ark opens and the last backup was a long time ago (3 backup intervals by default, never under 3 days), a notice says so, with Dismiss and "Don't show again". A computer that was off is normal; the notice is only a prompt to check.
- b-ark, b-ark-chrome: when a backup fails, the notice says whether you're offline or Blipfoto isn't
  answering, with Retry and a link to the unofficial Blipfoto status page.
- b-ark, b-ark-chrome: the About popup links to the unofficial Blipfoto status page.

### Changed

- b-ark: updated to Electron 45.
- b-ark: the Gap check setting now defaults to 30 days for new installs, matching b-ark-chrome (it was 31). Existing settings keep the value they already have.
- b-ark: **Scheduled backups** is now the one setting for background backups. Turning it on also makes b-ark start with Windows (the separate "Start with Windows" setting is gone; the tray item is now "Enable scheduled backups"). With it off, closing the window exits b-ark, asking first if a backup is running; with it on, the tray's Exit asks before disabling scheduled backups.

## [b-mobile 1.2.2] - 2026-11-03

### Fixed

- b-mobile: a star or heart you've given now shows as given (star yellow, heart red) when an entry
  opens, and repeat taps no longer bump the count.
- b-mobile: after publishing, the confirmation screen shows the entry's thumbnail as Blipfoto has
  it, instead of a squashed copy of your photo.
- b-mobile: on Android 10 and older the area behind the status bar is brand green instead of white.
- b-mobile: links that open the app, and the preview of a photo shared into it, work on older
  Android WebViews.

## [b-mobile 1.2.1] - 2026-11-02

### Fixed

- b-mobile: tapping a tag on an entry now lists its entries (the search was missing the `#`). Tags
  with spaces or symbols can't be searched by Blipfoto, so the screen says so.
- b-mobile: when something fails to load (entries, profiles, awards, notifications, comments, the
  map, Settings, the biography editor), you now get a friendly message that says whether you're
  offline or Blipfoto isn't answering, with Try again and a link to the status page, instead of
  red error text.

## [b-mobile 1.2.0] - 2026-11-02

### Added

- b-mobile: satellite view, switched on the Map and the location picker.

### Changed

- b-mobile: publishing now happens right away and ends on a confirmation screen. Uploads no longer
  queue up in the background, and the Uploads screen is gone.
- b-mobile: the menu follows the website's order, with icons, your account at the top and the app
  version at the bottom.
- b-mobile: Settings is regrouped into Appearance, Reminders, and Details & journal.
- b-mobile: Settings and Help always show a back arrow, and tapping "b-mobile" in the header takes
  you home.

### Fixed

- b-mobile: the default thumbnail is the centred square, as Blipfoto expects.
- b-mobile: a failed membership check, and the real reason a publish failed, are now shown.

## [b-mobile 1.1.0] - 2026-10-31

### Added

- b-mobile: Dark and Mid themes, with a Theme setting. The map and the status bar follow the theme.
- b-mobile: when you pick a photo from your gallery, its stored location is read and offered as the
  entry's location; turning on "Add to map" while editing also finds the stored position.
- b-mobile: Help & about and the "can't reach Blipfoto" screen link to the unofficial status page.
- b-mobile: a thumbnail preview, and you can choose the thumbnail when replacing a photo.

### Changed

- b-mobile: the Map screen and location picker use a new raster base map.
- b-mobile: "Select thumbnail" replaces the old crop wording.
- b-mobile: refuses a non-`https://` push service URL (build-time check in the release workflow, and
  a clear error on the first request).
- b-status and b-push Workers: plain `http://` requests are refused (GET/HEAD redirect to https, anything else gets 403) instead of being served.
- b-mobile: the app asks for the new media-location permission, used only to read the location
  stored in a photo you pick.

### Fixed

- b-mobile: the thumbnail you selected was ignored by Blipfoto; it is now applied.
- b-mobile: signing in a new account could leave you on the sign-in screen; the account now becomes
  active only once sign-in finishes.

## [b-mobile 1.0.2] - 2026-10-26

### Changed

- b-mobile: when a browse list can't load, it now says whether you seem to be offline or Blipfoto
  can't be reached, and offers swipe-down or a Try again button, instead of a bare error line.

### Fixed

- b-mobile: the map and location picker say when the map can't be displayed (no WebGL2, or a lost
  graphics context), instead of showing a blank area.
- b-mobile: Help & info showed the b-ark version (e.g. 1.0.5) instead of b-mobile's own (1.0.1).

## [1.0.6] - 2026-10-23

### Added

- b-view-backup: backup-folder data hooks and standalone viewer SPA, split out so the shells
  share one backup-to-viewer adapter.
- b-visual: shared design tokens and visual style guide, used by b-view and b-mobile.
- b-ark-chrome: back up Original and Extra images alongside the standard entry images,
  with a lightbox viewer (b-view `Lightbox`/`EntryDetail`) for browsing them.
- b-ark, b-ark-chrome: an amber notice banner explains why a journal is amber, with Sign in,
  Retry and Dismiss actions where they apply.

### Changed

- b-ark: updates are read from a permanent `b-ark-latest` release, so another package's release can
  no longer hide an update; the download link on the website always points at the current installer.

### Fixed

- backup-engine: improved missing-image detection and re-fetch logic.
- b-ark-chrome: thumbnail display during an in-progress backup.
- backup-engine: entries that fail to download are retried, recorded in `journal.json` and fetched
  again on later runs, and a journal whose entry count exceeds what is archived is reconciled
  against its full listing, so entries skipped by an earlier backup are filled in without
  starting a new backup.
- b-ark-chrome: a finished backup with entries outstanding no longer relaunches a backup on every
  Blipfoto page visit; an interrupted one resumes at most once every 15 minutes.
- b-ark: the status bar no longer shows a long red message for an amber journal.

## [b-mobile 1.0.1] - 2026-10-23

### Changed

- b-mobile: swiping an entry now moves the way a photo gallery does: swipe left for the next
  (newer) entry, right for the previous (older) one.
- b-mobile: Edit entry shows the entry's thumbnail at the top with a Replace image button, which
  opens the same Take a photo / Choose from device screen as posting.

### Fixed

- b-mobile: editing an older entry no longer appears to save a new title or description that
  Blipfoto then ignores. Where Blipfoto only allows tags and location to change, that is all
  Edit entry offers, and the edit button is hidden for entries that can't be edited at all.

## [b-mobile 1.0.0] - 2026-10-20

First release of b-mobile, an Android app for Blipfoto, published on Google Play by Salient Point
Consulting Ltd. Free, no ads, open source.

### Added

- b-mobile: browse Blipfoto (Recent, Following, Popular, Milestones, New Blippers, Nearby), search,
  and a map of entries; post entries from the camera or gallery with a photo upload queue that
  retries on its own; star, favourite, comment, reply and follow; multiple accounts; hide members;
  report entries, comments and members; pull down to refresh.
- b-mobile: optional notifications for new comments and activity, and a daily reminder to post.
- b-push: new Cloudflare Worker + D1 service that sends push notifications to b-mobile. Records are
  deleted as soon as a registration's access is revoked.

## [1.0.5] - 2026-09-08

### Added

- b-ark-chrome: new browser extension for backing up your Blipfoto journal directly
  from Chrome, no separate app required.
- b-ark and b-ark-chrome: back up Original, hires, and Extra images alongside the
  standard entry images — for b-ark via a per-journal sign-in to the blipfoto.com
  website, for b-ark-chrome using your existing browser session. b-ark-chrome adds a
  lightbox viewer for browsing Extra images.

### Changed

- Faster backups on both platforms.
- Backups now process newest posts first, running repair/redo passes last — so recent
  entries are available sooner during a backup.

### Fixed

- File renames during atomic writes could fail on some systems; the rename
  step is now reliable.
- b-ark: the "open in browser" web viewer no longer 404s on launch — its local
  server now falls back to `index.html` for the root URL and other
  client-routed paths, instead of only serving exact file matches.

## [1.0.0] - 2026-06-11

### Added

- Authentication error banner — surfaces OAuth / token failures directly in the app

### Changed

- OAuth flow refactored into `b-api` for reuse and cleaner separation from the Electron shell
- Development instances no longer register Windows launch-at-login (prevents dev builds
  hijacking auto-start)

### Fixed

- Silent backup failures now surface an error instead of failing quietly
- Windows failed-backup notifications fixed

## [0.9.0] - 2026-05-29

### Added

- RAG (red / amber / green) status indicator on the system tray icon — at-a-glance health
  without opening the app
- Windows toast notifications for failed backups
- Full-text search across journal entries
- b-api: complete TypeScript client for the Blipfoto v4 REST API, usable independently of
  b-ark in any browser or Node.js 18+ project

### Changed

- UI layout restructured for cleaner proportions, better resizing behaviour, and improved
  back-button navigation
- System tray icons refined

## [0.3.0] - 2026-05-28

### Added

- Info overlay on journal entries in b-view

### Changed

- Pagination redesigned in b-view for cleaner navigation
- Larger text throughout b-view entry views

## [0.2.0] - 2026-05-28

### Added

- Calendar picker for navigating to a specific date in b-view

### Changed

- Date formatting on journal entry pages updated for clarity

### Fixed

- Zoom controls in b-view now have a visible surrounding border

## [0.1.0] - 2026-05-27

### Added

- Monorepo scaffold with five packages: `b-api`, `backup-engine`, `b-view`, `b-ark-ui`, `b-ark`
- `b-api`: HTTP client for the Blipfoto v4 API with rate-limit header parsing
- `backup-engine`: incremental backup algorithm with checkpoint/resume, gap-check, redo window, and `PlatformIO` abstraction
- `b-view`: standalone React SPA and embeddable components for browsing a backed-up journal (also runs in `file://` mode)
- `b-ark-ui`: React UI with `BackendContext` abstraction and `ElectronBackend` implementation (wraps `window.api`)
- `b-ark`: Electron shell with OAuth 2.0 implicit flow, custom `b-ark://oauth/callback` protocol, and `ElectronPlatformIO`
- "Add another account" flow via internal browser window
- Live in-progress viewing during backup (b-view assets written to the backup folder at backup start)
- Auto-resume for interrupted initial backups
- Per-account settings: redo window, gap-check days, API delay, schedule toggle, launch-with-Windows toggle
- Logging panel with clear indication when API rate limits are hit
- Status bar, toast notifications, split-button menus, grid view, entry navigation
- SPDX/GPL-3.0-or-later headers on all source files; CLA for contributions
- Code-signed Windows build pipeline via GitHub Actions (`release-win.yml`)
- Phased routine backup: dedicated new-posts discovery step followed by image downloads, with a segmented progress banner throughout
- Version number shown in "About" dialogs in b-ark and b-view
- Avatar/profile image caching to avoid redundant API requests
- Settings and log panel promoted to global scope (no longer per-account)
- Security hardening based on internal audit recommendations

### Changed

- Atomic file writes now use `writeFile(.tmp)` + `rename(.tmp → final)` instead of writing twice and deleting `.tmp`, giving a true atomic guarantee for `journal.json`, `_checkpoint.json`, and per-entry `.json` files
- `PlatformIO` interface gains a `rename(from, to)` method
- Node engine bumped to `>=22.12.0`
- b-view folder in backups renamed from `assets` to `b-view`
- Upgraded to React 19
- Account management call-to-action labels updated to match revised settings flow

### Fixed

- OAuth client-ID misread on startup
- OAuth re-authorisation flow and internal-window "sign in using another account"
- Account removal errors and cancellation messaging
- CORS handling for the embedded entry viewer
- Empty data fields in API responses (most entry fields previously empty)
- Failed image display in certain entries
- Rate-limit handling and recovery
- Cache-related error messages
- Token-store exception handling
- Multiple incremental-mode bugs (full re-walk on resume, missing entry detection)
- Entry styling and navigation issues
- b-view running under `file://` (no http server available)
- Backup entry count display now reflects current progress accurately
- Error messages made more descriptive throughout
