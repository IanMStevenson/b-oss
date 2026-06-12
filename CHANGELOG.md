# Changelog

All notable changes to b-oss will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Split `b-ark-ui` into `b-ark-ui-components` (shared, prop-driven presentational kit +
  `BackendContext` interface + view types) and `b-ark-ui-electron` (desktop shell:
  multi-account `App`, `ElectronBackend`, and thin container wrappers). Desktop b-ark
  behaviour is unchanged; the split lets the forthcoming Chrome plugin reuse the kit.

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
