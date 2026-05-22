# Prompt 4 — `packages/b-view`

## Context

You are building **b-oss**. The monorepo is scaffolded, the API client is built, and the backup engine is built. You are now implementing `b-view` — the journal viewer.

`b-view` has two distinct outputs:

1. **Shared React components** (`ThumbnailGrid`, `EntryDetail`, etc.) — imported by `b-ark-ui` in Prompt 5 and used inside the Electron app's main area.
2. **Standalone SPA** (`dist/` folder) — built by Vite and written into each backup folder by b-ark. A user can open `index.html` via b-ark's local HTTP server and browse their journal. Uploading the backup folder to a static web host publishes it online.

This package has **no Electron or Node dependencies**. It is a pure React + TypeScript component library with a Vite-powered SPA shell.

---

## Package location

`packages/b-view/`

---

## Design reference

Refer to `D:\B-oss\kick-off\blipfoto-screenshots\EntryPage.png` and `D:\B-oss\kick-off\blipfoto-screenshots\NavigationPage.png` for the visual design of the journal viewer. Key observations:

**NavigationPage.png** — the thumbnail grid:
- Square thumbnails arranged in a grid
- Numbered pagination: `« 1 2 3 ... 30 »`

**EntryPage.png** — the entry detail view:
- Photo is always the same width (fills available width)
- If the aspect ratio would make the photo taller than a maximum height, the height is capped and **light grey sidebars appear** (like letterboxing — `object-fit: contain` on a grey `#f0f0f0` background)
- Left/right navigation arrows at the top of the photo area
- The main photo itself acts as a click zone: clicking the **left half** navigates to the previous entry, clicking the **right half** navigates to the next entry
- Left/right **keyboard arrow shortcuts** also navigate (add event listener on mount, remove on unmount)
- A stats panel with views, stars, favourites, comments counts
- EXIF data section

---

## Design tokens

Use CSS custom properties consistently. Define these in a `src/styles/tokens.css` file:

```css
:root {
  --green-900: #143729;
  --green-800: #1f4d3a;
  --green-700: #2a6347;
  --green-100: #eef2ee;
  --green-50:  #f6f8f6;
  --ink:       #111111;
  --ink-2:     #2a2a2a;
  --muted:     #6b7280;
  --muted-2:   #9ca3af;
  --line:      #e5e7eb;
  --line-2:    #eeeeee;
  --bg:        #ffffff;
  --bg-alt:    #fafafa;
  --photo-bg:  #f0f0f0;   /* grey sidebars when photo letterboxes */
  --rag-green: #22a06b;
  --rag-amber: #e8a93c;
  --rag-red:   #d04545;
}
```

Typography: `"Helvetica Neue", Helvetica, Arial, sans-serif`, body `13px / 1.45`.
Icons: **Lucide React** (`lucide-react`). Hairline, `strokeWidth={1.6}`, `currentColor`.

---

## File structure

```
packages/b-view/src/
  styles/
    tokens.css          # CSS custom properties
    base.css            # reset + global typography
  types.ts              # re-exports of BlipEntry, JournalMetadata from backup-engine
  hooks/
    useJournal.ts       # load journal.json, expose full metadata + entries
    useEntry.ts         # load a single YYYY-MM-DD.json on demand
  components/
    ThumbnailGrid.tsx   # paginated thumbnail grid with size controls
    EntryDetail.tsx     # full entry view (photo + caption + stats + EXIF)
    InfoPopup.tsx       # b-view "about" popup
    Pagination.tsx      # reusable « 1 2 3 ... N » pagination strip
  spa/
    App.tsx             # SPA shell (header bar, routing, embedded mode)
    main.tsx            # Vite entry point
  index.ts              # package export (components + hooks + types — NOT spa shell)
```

---

## 1. `src/types.ts`

Re-export the types needed from `backup-engine`:

```typescript
export type { BlipEntry, BlipComment, JournalMetadata, EntryIndex } from 'backup-engine';
```

---

## 2. `src/hooks/useJournal.ts`

```typescript
export type JournalState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: JournalMetadata };

export function useJournal(journalUrl?: string): JournalState;
```

**Implementation notes:**

- If `journalUrl` is provided, fetch from that URL. Otherwise, fetch `'./journal.json'` (relative — works from an HTTP server and from static hosting).
- Use `fetch()` with standard error handling:
  - 404 → `{ status: 'error', message: 'journal.json not found' }`
  - Network failure → `{ status: 'error', message: <error message> }`
- Return `{ status: 'loading' }` until the fetch resolves.
- On success, validate that `data.schema_version === 1`; if not, surface an error.
- The hook must handle re-fetching if `journalUrl` changes.
- **File System Access API fallback**: when running from a `file://` URL (e.g. user double-clicked `index.html`), `fetch('./journal.json')` is blocked by Chrome's CORS policy. Detect this case (`window.location.protocol === 'file:'`) and instead of fetching, show a friendly message:

  > "To browse your journal, open it through b-ark's viewer or upload the folder to a web host. Direct file access is not supported by browsers."

  (b-ark serves the folder over a local HTTP server, so the typical in-app use case is already solved.)

---

## 3. `src/hooks/useEntry.ts`

```typescript
export type EntryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: BlipEntry };

export function useEntry(jsonPath: string | null): EntryState;
```

- `jsonPath` is the relative path from `journal.json`, e.g. `"entries/2024/2024-01-15.json"`
- When `jsonPath` is `null`, return `{ status: 'idle' }` immediately
- Otherwise fetch the file, parse, and return the `BlipEntry`
- Re-fetch when `jsonPath` changes

---

## 4. `src/components/Pagination.tsx`

```typescript
interface PaginationProps {
  currentPage: number;   // 1-indexed
  totalPages: number;
  onPage: (page: number) => void;
}
```

Render a `« 1 2 3 ... 30 »` strip. Show at most 7 page numbers around the current page; collapse to `...` beyond that. Use `ChevronLeft` and `ChevronRight` from Lucide for the arrows.

---

## 5. `src/components/ThumbnailGrid.tsx`

```typescript
interface ThumbnailGridProps {
  entries: EntryIndex[];          // full list (all entries, sorted newest-first)
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  sizePercent?: number;           // default 100
  onSizeChange?: (newPercent: number) => void;
  pageSize?: number;              // thumbnails per page, default 60
}
```

### Layout

The grid occupies the full available height (flex column, `flex: 1`, `overflow-y: auto`).

**Controls row** (above the grid):
- Zoom-out icon (`ZoomOut` from Lucide) → `sizePercent - 10`, clamped to 30
- Current percentage label (e.g. `100%`)
- Zoom-in icon (`ZoomIn`) → `sizePercent + 10`, clamped to 200
- Reset icon (`RotateCcw`) → returns to 100%
- Show controls only if `onSizeChange` is provided

**Grid**:
- `grid-template-columns: repeat(cols, minmax(0, 1fr))`, gap `6px`
- Column count formula: `cols = Math.round(Math.min(14, Math.max(4, 8 * (100 / sizePercent))))`
- Padding: `18px 24px`
- Each thumbnail is a `<button>` (accessible) with `aspect-ratio: 1/1`, `overflow: hidden`, `border-radius: 2px`
- Image: `<img>` with `object-fit: cover`, `width: 100%`, `height: 100%`
- Selected thumbnail: `2px solid var(--green-800)` outline
- Hover: faint dark gradient overlay on the image bottom (CSS `::after` pseudo-element, `opacity: 0 → 1`, `transition: 140ms`)

**Pagination** below the grid (only shown when `totalPages > 1`):
- Centred row, uses the `<Pagination>` component
- Padding: `12px 24px`

### Image loading

Each `<img>` uses the `thumbnail_path` from `EntryIndex`. Set `loading="lazy"` on all images.

If the image fails to load, show a placeholder div with `var(--bg-alt)` background and a greyed `Image` icon from Lucide (centred).

---

## 6. `src/components/EntryDetail.tsx`

```typescript
interface EntryDetailProps {
  entryState: EntryState;           // from useEntry
  prevEntryId: string | null;       // for navigation
  nextEntryId: string | null;       // for navigation
  onNavigate: (entryId: string) => void;
  onClose?: () => void;             // optional — shown as ← back button if provided
}
```

### Photo section

```
┌────────────────────────────────────────────┐
│  [←]   YYYY-MM-DD  "Title"           [→]  │  ← navigation header row
├────────────────────────────────────────────┤
│                                            │
│  ░░░░ [photo — object-fit: contain] ░░░░  │  ← grey sidebars if photo is portrait/square
│                                            │
└────────────────────────────────────────────┘
```

**Photo container**:
- `background: var(--photo-bg)` (`#f0f0f0`)
- `width: 100%`
- `max-height: 70vh`
- `display: flex; align-items: center; justify-content: center`
- `overflow: hidden`

**Photo `<img>`**:
- `object-fit: contain`
- `max-width: 100%`
- `max-height: 70vh`
- `display: block`

The grey background behind the image creates the letterboxing effect automatically when the image is narrower than the container (e.g. portrait or square photos).

**Click zone navigation**:
- The photo container is split into two invisible halves using `::before` and `::after` pseudo-elements (or two absolutely-positioned divs), each `50%` wide
- Left half: cursor `w-resize`, on click navigate to `prevEntryId` if present
- Right half: cursor `e-resize`, on click navigate to `nextEntryId` if present
- Do not interfere with the actual image display — these are overlays

**Keyboard navigation**:
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && prevEntryId) onNavigate(prevEntryId);
    if (e.key === 'ArrowRight' && nextEntryId) onNavigate(nextEntryId);
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [prevEntryId, nextEntryId, onNavigate]);
```

**Navigation header row** (above the photo):
- Left: `ChevronLeft` icon button → navigate to `prevEntryId`; disabled if null
- Centre: `YYYY-MM-DD  "Title"` (date in muted monospace, title in ink-2 at 15px/600)
- Right: `ChevronRight` icon button → navigate to `nextEntryId`; disabled if null
- If `onClose` provided: `ArrowLeft` icon button on the far left labelled "Back"

### Caption & metadata section (below photo)

Scrollable area. Max width `780px`, centred, padding `24px`.

**Description**: rendered as HTML (use `dangerouslySetInnerHTML` with the `description_html` field). The HTML contains only `<b>`, `<i>`, `<u>`, `<strike>`, `<a>`, `<br>` tags from Blipfoto BBCode — safe to render directly.

**Tags** (if any): rendered as a row of pill chips, `var(--green-100)` background, `var(--green-800)` text, `14px radius`, `4px 10px` padding.

**Stats row** (if any are non-zero):
```
👁 1,234 views   ★ 56 stars   ♥ 12 favourites   💬 8 comments
```
Use Lucide icons: `Eye`, `Star`, `Heart`, `MessageSquare`. Muted colour, 13px. Only show non-zero counts.

**EXIF** (if `exif` is not null): a small grid of key-value pairs in monospace 12px text.

| Field | Show as |
|---|---|
| `camera` | Camera |
| `exposure_time` | Exposure |
| `f_number` | Aperture |
| `focal_length` | Focal length |
| `iso` | ISO |

Only show fields that are non-null. Wrap in a collapsible `<details>` element labelled "EXIF" if more than 2 fields.

**Location** (if `location` is not null): show `📍 lat, lon` in muted text. (A map is a future enhancement.)

### Loading / error states

- `status: 'loading'`: show a centred spinner (`Loader2` Lucide icon, spinning via CSS animation)
- `status: 'error'`: show the error message in red with an `AlertCircle` icon
- `status: 'idle'`: render nothing (no entry selected)

---

## 7. `src/components/InfoPopup.tsx`

```typescript
interface InfoPopupProps {
  isOpen: boolean;
  onClose: () => void;
}
```

A modal overlay (semi-transparent black backdrop, `z-index: 1000`). The popup card (max-width `420px`, centred, `24px` padding, `12px` border-radius, white background):

- **b-view** wordmark (`17px / 700 / var(--green-800)`)
- Body text: "b-view is an open-source journal viewer for Blipfoto backups, part of the **b-oss** project."
- "© [year] Ian Stevenson. Licensed under the GNU General Public License v3."
- Link: `https://github.com/ianstevenson/b-oss` (replace with actual GitHub URL once known — use this placeholder)
- Close button: `×` in the top-right corner

---

## 8. `src/spa/App.tsx` — standalone SPA shell

```typescript
export default function App() {
  const [embedded, setEmbedded] = useState(/* parse ?embedded=true from URL */);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [sizePercent, setSizePercent] = useState(100);

  const journal = useJournal();
  const entryIndex = journal.status === 'loaded' ? journal.data.entries : [];

  // Entry navigation
  const selectedIndex = entryIndex.findIndex(e => e.entry_id === selectedEntryId);
  const prevEntry = selectedIndex > 0 ? entryIndex[selectedIndex - 1] : null;
  const nextEntry = selectedIndex < entryIndex.length - 1 ? entryIndex[selectedIndex + 1] : null;

  const entry = useEntry(
    selectedEntryId
      ? entryIndex.find(e => e.entry_id === selectedEntryId)?.json_path ?? null
      : null
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {!embedded && <Header onInfoClick={() => setInfoOpen(true)} journalTitle={...} />}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedEntryId === null ? (
          <ThumbnailGrid
            entries={entryIndex}
            selectedEntryId={null}
            onSelectEntry={setSelectedEntryId}
            sizePercent={sizePercent}
            onSizeChange={setSizePercent}
          />
        ) : (
          <EntryDetail
            entryState={entry}
            prevEntryId={prevEntry?.entry_id ?? null}
            nextEntryId={nextEntry?.entry_id ?? null}
            onNavigate={setSelectedEntryId}
            onClose={() => setSelectedEntryId(null)}
          />
        )}
      </main>
      <InfoPopup isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
```

### Header component (SPA shell only — not exported as a shared component)

```
┌──────────────────────────────────────────────────────┐
│  b-view                        [journal title]    ⓘ  │
│  (green-800 bg, white text, 48px tall)                │
└──────────────────────────────────────────────────────┘
```

- Background: `var(--green-800)`, text white
- Left: **b-view** wordmark (`17px / 700 / letter-spacing -0.01em`)
- Centre: journal title from `journal.json` (muted white, `13px`)
- Right: `Info` icon button (`16px`, white, opens InfoPopup)

### Detecting embedded mode

```typescript
const params = new URLSearchParams(window.location.search);
const embedded = params.get('embedded') === 'true';
```

When `embedded === true`, the header is suppressed. This is for external websites iframing b-view.

---

## 9. `src/spa/main.tsx` — Vite entry point

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.js';

createRoot(document.getElementById('root')!).render(<App />);
```

The Vite config for the SPA build (`vite.config.ts` in this package root) should output to `dist/`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'src/spa/index.html',
    },
  },
});
```

Create `src/spa/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>b-view</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
```

---

## 10. `src/index.ts` — package export

Export only the shared components and hooks — **not** the SPA shell:

```typescript
export { ThumbnailGrid } from './components/ThumbnailGrid.js';
export { EntryDetail } from './components/EntryDetail.js';
export { InfoPopup } from './components/InfoPopup.js';
export { Pagination } from './components/Pagination.js';
export { useJournal } from './hooks/useJournal.js';
export { useEntry } from './hooks/useEntry.js';
export type * from './types.js';
```

---

## package.json

Ensure `packages/b-view/package.json` has:

```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "lucide-react": "^0.383.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

---

## Acceptance criteria

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build --workspace=packages/b-view` succeeds and produces `dist/index.html` + bundled JS/CSS
- [ ] Thumbnail grid renders entries with correct column count at 100% zoom
- [ ] Zoom in/out/reset controls work
- [ ] Clicking a thumbnail loads the entry detail view
- [ ] Left/right navigation buttons work (and disable correctly at first/last entry)
- [ ] Left/right keyboard shortcuts work in EntryDetail
- [ ] Clicking left half of photo navigates to previous entry
- [ ] Clicking right half of photo navigates to next entry
- [ ] `?embedded=true` removes the header bar
- [ ] Portrait/square photos show grey sidebars (object-fit: contain on grey background)
- [ ] Info popup opens and closes
- [ ] `file://` protocol shows the friendly "use b-ark or web host" message instead of a fetch error
- [ ] `useJournal` returns `loading` → `loaded` lifecycle
- [ ] `src/index.ts` does not export anything from `spa/`

## Do NOT

- Do not `import from 'electron'` or any Node module — zero platform dependencies
- Do not use `localStorage` — all state is in-memory (React state)
- Do not implement the b-ark management UI (sidebar, settings, log) — that is Prompt 5
- Do not use `dangerouslySetInnerHTML` for anything other than the pre-rendered `description_html` field from the Blipfoto API (which contains only safe BBCode-generated HTML)
- Do not hard-code paths — always use relative paths from `journal.json`
- Do not add a router library (React Router, etc.) — the SPA has only two states (grid and entry detail), managed with simple `useState`
- Do not add animation libraries — use plain CSS transitions
