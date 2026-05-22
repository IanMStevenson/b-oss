# b-oss Architecture

## Package dependency graph

```
b-ark (Electron shell)
  └── b-ark-ui (React UI, BackendContext interface)
        └── b-view (shared React components)
  └── backup-engine (backup algorithm, PlatformIO interface)
        └── blipfoto-api (HTTP client)
```

## Two abstraction boundaries

### 1. PlatformIO (backend I/O)

`backup-engine` defines `PlatformIO` — an interface for filesystem and download operations.
`b-ark` implements `ElectronPlatformIO` using Node's `fs/promises`.
A future React Native port would implement a different `PlatformIO` — the backup logic is unchanged.

### 2. BackendContext (UI shell)

`b-ark-ui` defines `BackendContext` — a React context interface for all "native" operations.
`b-ark` implements `ElectronBackend` using Electron IPC (contextBridge).
A future Capacitor/iPad port would implement a different `BackendContext` — the UI is unchanged.

## IPC security rules

- All IPC channels typed in `packages/b-ark/src/preload/index.ts`
- Renderer accesses native operations only via `window.api` (contextBridge)
- Access tokens never leave the main process
- No raw Node APIs exposed to the renderer

## File naming in backup folders

- `YYYY-MM-DD.json` — full entry data
- `YYYY-MM-DD.jpg` — original image
- `YYYY-MM-DD-t.jpg` — user-selected thumbnail
- Folder: `entries/YYYY/` — one subfolder per year
