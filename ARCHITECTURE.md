# b-oss Architecture

## Package dependency graph

```
b-ark (Electron shell)
  └── b-ark-ui-electron (desktop React shell, ElectronBackend)
        ├── b-ark-ui-components (shared presentational kit, BackendContext interface)
        └── b-view (shared React components)
  └── backup-engine (backup algorithm, PlatformIO interface)
        └── b-api (HTTP client)

b-ark-chrome (Chrome extension shell)
  └── b-ark-ui-chrome (browser React shell, BrowserBackend + BrowserPlatformIO)
        ├── b-ark-ui-components (shared presentational kit, BackendContext interface)
        └── b-view (shared React components)
  └── backup-engine (backup algorithm, PlatformIO interface)
        └── b-api (HTTP client)
```

```
b-mobile (Capacitor/Ionic Android app)
  ├── b-api (HTTP client)
  ├── b-view (shared React components)
  │     └── b-visual (design tokens)
  └── b-visual (design tokens)

b-push (Cloudflare Worker + D1 notification service for b-mobile)
  └── b-api (HTTP client)
```

`b-view-backup` sits between the backup world and `b-view`: it holds the backup-folder data
hooks and the standalone viewer SPA, depending on `b-view` and `backup-engine`. Both
`b-ark-ui-electron` and `b-ark-ui-chrome` use it to feed `b-view` from a backup folder.
`b-view` itself is source-agnostic and prop-driven, so `b-mobile` feeds the same components from
live `b-api` data.

The two desktop/browser shells share everything below the platform boundary; only the leftmost
packages (`b-ark` / `b-ark-chrome`) and their UI shells (`b-ark-ui-electron` / `b-ark-ui-chrome`)
are platform-specific. `b-mobile` and `b-push` are separate apps: they reuse `b-api`, `b-view`
and `b-visual` but not `backup-engine`, `PlatformIO` or `BackendContext`.

## Two abstraction boundaries

### 1. PlatformIO (backend I/O)

`backup-engine` defines `PlatformIO` — an interface for filesystem and download operations.
`b-ark` implements `ElectronPlatformIO` using Node's `fs/promises`.
`b-ark-ui-chrome` implements `BrowserPlatformIO` using the File System Access API (operating
on a user-granted `FileSystemDirectoryHandle`) — the backup logic is unchanged.
`b-mobile` does not implement `PlatformIO` (it does not run backups).

### 2. BackendContext (UI shell)

`b-ark-ui-components` defines `BackendContext` — a React context interface for all "native"
operations — alongside the shared, prop-driven presentational components. `b-ark-ui-electron`
includes `ElectronBackend`, which implements it by wrapping `window.api` IPC calls
(no direct `electron` imports). `b-ark` instantiates `ElectronBackend` and provides it to the React tree.
`b-ark-ui-chrome` includes `BrowserBackend`, which implements the same interface by wrapping
`chrome.storage`/`chrome.runtime` and the FSA layer — `b-ark-chrome` instantiates it and provides
it to the React tree. The shared presentational UI is unchanged across both shells.

### 3. Capacitor platform layer (b-mobile)

`b-mobile` isolates all native access in `packages/b-mobile/src/platform/` (HTTP via
CapacitorHttp, camera, filesystem and image cache, upload, local notifications, push
registration, geolocation, deep links). Only that directory may import `@capacitor/*` (ESLint
enforces this); screens and data hooks use the wrappers, which makes the rest of the app testable
under jsdom with the wrappers mocked. Shared components such as `b-view` take host behaviour as
props/callbacks instead of importing Capacitor. See
`packages/b-mobile/docs/ImplementationSpec/app-architecture.md`.

### 4. b-push (notification service)

`b-push` polls Blipfoto for registered `b-mobile` accounts' unread counts and sends FCM pushes
when a count rises. It talks to `b-mobile` only over HTTP (a registration contract); there is no
code dependency in either direction. Deployed manually; see `packages/b-push/README.md`.

## IPC security rules

### Electron

- All IPC channels typed in `packages/b-ark/src/preload/index.ts`
- Renderer accesses native operations only via `window.api` (contextBridge)
- Access tokens never leave the main process
- No raw Node APIs exposed to the renderer

### Chrome extension

- `chrome.*` access is confined to `b-ark-ui-chrome` (BrowserBackend, platform modules, chip)
  and `b-ark-chrome` (service worker, OAuth, content scripts)
- Access tokens are AES-GCM encrypted at rest (`tokenCiphertext`/`tokenIv` in
  `chrome.storage.local`; CryptoKey in IndexedDB) and handed straight to `BackupEngine` —
  never sent over `chrome.runtime` messages
- The OAuth token is captured in the service worker and decrypted on demand by the backend

## File naming in backup folders

- `YYYY-MM-DD.json` — full entry data
- `YYYY-MM-DD.jpg` — display image
- `YYYY-MM-DD-t.jpg` — user-selected thumbnail
- `YYYY-MM-DD-o.jpg` — original-quality image (when available from the API)
- `YYYY-MM-DD-h.jpg` — hires image (when available from the API)
- Folder: `entries/YYYY/` — one subfolder per year
- Date collisions are resolved by appending the entry ID: `YYYY-MM-DD-{entry_id}.json`
