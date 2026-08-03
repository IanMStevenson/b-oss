# Platform decision & package reuse plan

## Platform

**Capacitor**, not a fully-native (Kotlin/Compose) app and not React Native. Decided specifically
to enable meaningful reuse of `b-view` and `b-api` from the `b-oss` monorepo.

## Package reuse plan

- **`b-api`** (API client) — reuse directly, **after adding a transport seam**. This is settled,
  not an open question: `BlipfotoClient`'s constructor takes `(accessToken, baseUrl)` and calls
  `globalThis.fetch` directly in `request()`, `mutate()` and `mutateMultipart()`. There is no
  injection point. Since Blipfoto serves no CORS headers, a browser/WebView `fetch()` is blocked
  and mobile must route through native HTTP, so the seam is on the critical path rather than a
  nicety.
  - **Required change:** an injectable transport (a `fetch`-shaped function supplied at
    construction, defaulting to `globalThis.fetch`), so the same client serves Electron, the
    Chrome extension, and Capacitor without forking.
  - **Open risk — needs a spike before the compose flow is built on it.** `mutateMultipart()`
    builds a `FormData` with a `Blob`. Native HTTP bridges have historically handled multipart
    bodies poorly or not at all, so entry publish and avatar upload may not survive the same
    transport as everything else. Three fallbacks, in preference order: a recent enough Capacitor
    HTTP implementation that handles multipart natively; constructing the multipart body by hand
    for the native bridge; or a thin CORS-injecting proxy (a Cloudflare Worker, peer to the
    notification service) with WebView `fetch()`. Prove which before committing.
- **`b-view`** (shared React viewer components) — reuse the **presentational layer**
  (`ThumbnailGrid`, `EntryDetail`, `Lightbox`, `DatePicker`, `Pagination`, `InfoPopup`,
  `tokens.css`) for the browse/view portion of the app. Concretely that covers `SCR-02`, `SCR-05`,
  `SCR-06` and `SCR-07`; the other ~24 screens are new work. **b-view is not the app's UI** — the
  goal is narrower and worth stating plainly: *don't maintain two separate thumbnail grids and two
  separate entry views.*
  - **Its data layer is not reusable as-is** — `FolderApp`/`HttpApp` only ever read from a local
    backup (File System Access API or a static HTTP export), never from a live API, and have no
    write paths (star/favourite/comment/follow/compose) since b-view is a read-only backup viewer.
  - **Required change, and an agreed requirement rather than an open question: split b-view from
    the backup data model.** Its components are currently typed against `BlipEntry` / `BlipComment`
    / `EntryIndex`, re-exported from `@b-oss/backup-engine`, which `b-view/package.json` declares
    as a runtime dependency. The split defines b-view's own view-model types and adapts *into* them,
    so backup data and live `b-api` data are interchangeable sources behind the same components.
  - **`@b-oss/backup-engine` must not be a dependency of the new app** — that dependency is exactly
    what the split removes.
- **`backup-engine`** — **not** reused, and not depended on (see the b-view split above). Built for
  the backup task specifically; this is a different task. May share/refactor some logic later to
  avoid duplication, but not a dependency.
- **`b-ark-ui-components`** — **not** reused directly, same reasoning: it's built around
  `BackendContext`, an abstraction shaped for a backup tool's native-op needs (file IO, etc.),
  not a full social app's CRUD needs (post, comment, follow, settings). Treated as a **strong
  style/pattern guide** — especially colours — not a dependency.
- **Shared design-tokens package** — extracting `tokens.css`'s values into a small shared
  package (rather than duplicating them into the new app) was raised as a good, low-risk idea.
  Deferred as part of a bigger future discussion, not decided now.
- Beyond the two required changes above, this is deliberately **light-touch** — it settles what is
  reused and what has to change to make that possible, not package/repo structure.

## What this document does not cover

This is a **reuse** plan, not an application architecture. The app's own architecture — project
layout, navigation and routing, state management, secure token storage, the durable upload queue,
the image cache, map provider, push client setup, BBCode rendering, background scheduling, and the
minimum/target SDK — is not specified anywhere yet and must be settled before implementation
starts.

## Cross-references

- `AppSpec/00-product.md` — references `b-view` as the app's starting visual language.
- `AppSpec/api-appendix/` — the API contract the client above talks to.
