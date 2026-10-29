# Changelog

All notable changes to b-oss will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- b-status and b-push Workers: plain `http://` requests are refused (GET/HEAD redirect to https, anything else gets 403) instead of being served.
- b-mobile: refuses a non-`https://` push service URL (build-time check in the release workflow, and a clear error on the first request).

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
