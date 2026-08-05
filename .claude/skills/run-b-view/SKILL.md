---
name: run-b-view
description: Launch and visually verify b-view's React components (ThumbnailGrid, EntryDetail, Lightbox) in a real headless-Chromium browser via Playwright, using b-view-backup's standalone SPA against a synthetic backup fixture. Use this whenever a change touches packages/b-view and typecheck/lint/vitest alone aren't enough to confirm it — verified working end-to-end on 2026-08-05.
---

# Running b-view in a real browser

`packages/b-view` is a component library with no app of its own (see the repo's root
`CLAUDE.md`). The lightest real host to drive it through is `packages/b-view-backup`'s
standalone SPA — same `ThumbnailGrid`/`EntryDetail`/`Lightbox` that `b-ark`/`b-ark-chrome`
embed, but servable as a plain static site with no Electron/Chrome-extension scaffolding.

## One-time host setup (not part of this skill — do this once per machine)

Headless Chromium needs ~62 system libraries (libatk, libgbm, fonts, etc.) that aren't
present by default on this machine. Install them once, in a real terminal with your own
sudo password (the agent cannot do this itself — `sudo` here has no passwordless rule and
the Bash tool can't answer an interactive password prompt):

```bash
sudo env "PATH=$PATH" npx playwright install-deps chromium
```

The `env "PATH=$PATH"` part matters — plain `sudo npx ...` fails with "npx not found"
because `sudo` resets PATH and doesn't see nvm-installed Node.

`playwright-core` is a root devDependency (added 2026-08-05). After `npm install`, run
`npx playwright install chromium` (no sudo needed) to fetch the matching browser binary
into `~/.cache/ms-playwright` — after that, `chromium.executablePath()` resolves it with
no explicit path required.

## Steps

1. **Build the SPA:**

   ```bash
   npm run build --workspace=@b-oss/b-view-backup
   ```

   Output lands in `packages/b-view-backup/dist-app/` (gitignored).

2. **Generate a synthetic backup fixture** — `journal.json` (schema per
   `JournalMetadata`/`EntryIndex` in `packages/backup-engine/src/types.ts`) plus
   `entries/YYYY/MM-DD.json` files (schema per `BlipEntry` in `packages/b-view/src/types.ts`)
   and matching thumbnail/image files, and copy them into `dist-app/`. A plain Python script
   generating minimal solid-color PNGs by hand (via `zlib`/`struct`, no PIL/ImageMagick
   needed) works fine — see git history around 2026-08-05 for a full worked example if one
   isn't already committed alongside this skill. Use **enough entries (20-30+)** if you need
   to exercise `ThumbnailGrid`'s pagination/swipe — a real browser viewport fits far more
   tiles per page than jsdom's unmeasured 2×2 fallback, so 10 entries may all fit on one page.

3. **Serve it:**

   ```bash
   cd packages/b-view-backup/dist-app
   python3 -m http.server 8973 &
   ```

4. **Drive it with `playwright-core`** (already a devDependency — no scratch `/tmp` install
   needed):

   ```js
   const { chromium } = require('playwright-core');
   const browser = await chromium.launch(); // executablePath resolves automatically
   const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
   await page.goto('http://localhost:8973/', { waitUntil: 'networkidle' });
   ```

5. **Screenshot and look at it** — use the `Read` tool on the resulting PNG (it renders
   images directly), don't just assert selectors blind.

6. **Clean up** — kill the http.server (`lsof -ti:8973 -sTCP:LISTEN | xargs -r kill`),
   remove the copied `journal.json`/`entries/` from `dist-app/` (the rest of `dist-app/` is
   gitignored build output, safe to leave, but don't let fixture data linger).

## Gotchas specific to b-view

- **Swipe gestures don't work via Playwright's own touch API.** `ThumbnailGrid`/`EntryDetail`/
  `Lightbox` use plain React `onTouchStart`/`onTouchEnd` handlers (see `useSwipeNav.ts`).
  Dispatch real `TouchEvent`/`Touch` objects from inside `page.evaluate` (in-page JS), not
  from Node:
  ```js
  await page.evaluate(
    ({ selector, dx }) => {
      const el = document.querySelector(selector);
      const rect = el.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      const x = rect.left + rect.width / 2;
      const mk = (cx) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(x)] }));
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [mk(x + dx)] }));
    },
    { selector, dx },
  );
  ```
- **`EntryDetail`'s photo-half overlays intentionally intercept clicks.** The
  `photoHalfLeft`/`photoHalfRight` divs sit on top of the main `<img>` by design (that's how
  click-to-navigate-entries works). Target `[class*="photoHalfLeft"]` /
  `[class*="photoHalfRight"]` directly — don't force-click through to the `<img>`, and don't
  be surprised when Playwright's auto-retry reports the overlay "intercepts pointer events."
  Also: whichever entry you open, check whether it actually _has_ a `prevEntryId`/
  `nextEntryId` in that direction (the oldest/newest entry in the fixture won't) before
  asserting a click should navigate.
- **CSS Modules produce hashed class names under Vite**, not the literal source names —
  `document.querySelector('.description')` won't match anything real. Not an issue when
  driving a real served build, since the served page provides its own runtime-consistent
  hashed classes to match against ad hoc, but keep it in mind if adapting selectors from a
  vitest test file (which imports the `.module.css` file directly, e.g.
  `import styles from '../components/EntryDetail.module.css'`, to get the actual hashed name).
