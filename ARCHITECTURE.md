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

The two shells share everything below the platform boundary; only the leftmost packages
(`b-ark` / `b-ark-chrome`) and their UI shells (`b-ark-ui-electron` / `b-ark-ui-chrome`)
are platform-specific.

## Two abstraction boundaries

### 1. PlatformIO (backend I/O)

`backup-engine` defines `PlatformIO` — an interface for filesystem and download operations.
`b-ark` implements `ElectronPlatformIO` using Node's `fs/promises`.
`b-ark-ui-chrome` implements `BrowserPlatformIO` using the File System Access API (operating
on a user-granted `FileSystemDirectoryHandle`) — the backup logic is unchanged.
A future React Native port would implement a different `PlatformIO` the same way.

### 2. BackendContext (UI shell)

`b-ark-ui-components` defines `BackendContext` — a React context interface for all "native"
operations — alongside the shared, prop-driven presentational components. `b-ark-ui-electron`
includes `ElectronBackend`, which implements it by wrapping `window.api` IPC calls
(no direct `electron` imports). `b-ark` instantiates `ElectronBackend` and provides it to the React tree.
`b-ark-ui-chrome` includes `BrowserBackend`, which implements the same interface by wrapping
`chrome.storage`/`chrome.runtime` and the FSA layer — `b-ark-chrome` instantiates it and provides
it to the React tree. The shared presentational UI is unchanged across both shells.
A future Capacitor/iPad port would supply yet another `BackendContext` implementation the same way.

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
