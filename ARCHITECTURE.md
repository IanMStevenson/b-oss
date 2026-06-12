# b-oss Architecture

## Package dependency graph

```
b-ark (Electron shell)
  └── b-ark-ui-electron (desktop React shell, ElectronBackend)
        ├── b-ark-ui-components (shared presentational kit, BackendContext interface)
        └── b-view (shared React components)
  └── backup-engine (backup algorithm, PlatformIO interface)
        └── b-api (HTTP client)
```

## Two abstraction boundaries

### 1. PlatformIO (backend I/O)

`backup-engine` defines `PlatformIO` — an interface for filesystem and download operations.
`b-ark` implements `ElectronPlatformIO` using Node's `fs/promises`.
A future React Native port would implement a different `PlatformIO` — the backup logic is unchanged.

### 2. BackendContext (UI shell)

`b-ark-ui-components` defines `BackendContext` — a React context interface for all "native"
operations — alongside the shared, prop-driven presentational components. `b-ark-ui-electron`
includes `ElectronBackend`, which implements it by wrapping `window.api` IPC calls
(no direct `electron` imports). `b-ark` instantiates `ElectronBackend` and provides it to the React tree.
A future Capacitor/iPad port would supply a different `BackendContext` implementation — the UI is unchanged.

## IPC security rules

- All IPC channels typed in `packages/b-ark/src/preload/index.ts`
- Renderer accesses native operations only via `window.api` (contextBridge)
- Access tokens never leave the main process
- No raw Node APIs exposed to the renderer

## File naming in backup folders

- `YYYY-MM-DD.json` — full entry data
- `YYYY-MM-DD.jpg` — display image
- `YYYY-MM-DD-t.jpg` — user-selected thumbnail
- `YYYY-MM-DD-o.jpg` — original-quality image (when available from the API)
- `YYYY-MM-DD-h.jpg` — hires image (when available from the API)
- Folder: `entries/YYYY/` — one subfolder per year
- Date collisions are resolved by appending the entry ID: `YYYY-MM-DD-{entry_id}.json`
