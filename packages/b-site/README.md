# b-site

The b-oss project website: a static [Astro](https://astro.build) site, no client-side framework.
It builds to plain HTML, so the output is as simple and fast as hand-written pages.

## Editing

Astro 7 needs Node >= 22.23.4 (the repo's other packages accept 22.12). The site is type-checked and
built by `site.yml` on Node 24, not by the root `npm run typecheck`.

```bash
npm run dev -w @b-oss/b-site        # live preview at http://localhost:4321
npm run build -w @b-oss/b-site      # static output in packages/b-site/dist
npm run typecheck -w @b-oss/b-site  # astro check
```

```
src/layouts/Layout.astro   <head>, header, footer and <main> wrapper for every page
src/components/            Header (nav), Footer, Hero, CtaBand, FeatureItem, PhoneShots
src/pages/*.astro          one file per page; page body only, wrapped in <Layout>
public/                    copied verbatim: site.css, site.js, assets/
```

- **Change the header, nav or footer once** in `Header.astro` / `Footer.astro`. A new page needs
  a `src/pages/<name>.astro`, plus a `links` entry in `Header.astro` if it belongs in the nav.
- **URLs are fixed.** `build.format: 'file'` emits `b-ark.html` rather than `b-ark/`, because the
  Play and Chrome Web Store listings and released b-mobile builds link to the `.html` URLs.
  Don't rename or move a page without leaving a redirect.
- **Links are relative** (`assets/…`, `contact.html`), so the site works from any sub-path.
- **Styling** is all in `public/site.css` (design tokens are CSS custom properties at the top).
  `site.js` is the click-to-enlarge lightbox, loaded only by pages that pass `lightbox` to `Layout`.
- The contact form posts to [Web3Forms](https://web3forms.com); its access key is in
  `src/pages/contact.astro`.

## Hosting (Cloudflare Workers static assets)

`wrangler.jsonc` makes this an assets-only Worker named `b-oss-site` serving `dist/`, in the same
Cloudflare account as b-push. Two files in `public/` configure it:

- `_headers`: security headers on every response, and a day of caching for `/assets/*`.
- `_redirects`: one rewrite, `/ /index.html 200`. With `html_handling: "none"` (needed so that
  `/b-api.html` is served as is rather than redirected to `/b-api`) the bare `/` has no file to
  serve otherwise.

Check changes locally on Cloudflare's runtime: `npm run build -w @b-oss/b-site`, then
`npx wrangler dev` in this folder. Its compatibility date must not be newer than the installed
`workerd` supports, or it refuses to start.

Cloudflare build settings (dashboard: Workers & Pages -> b-oss-site -> Settings -> Builds), run from
the repo root:

- Build command: `npm ci --ignore-scripts --workspace @b-oss/b-site && npm run build -w @b-oss/b-site`
- Deploy command: `npx wrangler deploy --config packages/b-site/wrangler.jsonc`
- Build variable: `NODE_VERSION=24` (Astro 7 needs Node >= 22.23.4)
- Build watch paths (Settings -> Build): include `packages/b-site/*`, nothing else. This is a busy
  monorepo; without it every merge to `main` would build and version an unchanged site.
- Do not make the Cloudflare build a required status check: PRs that skip it would never report one.
  `site.yml` and `ci` cover site changes.

## CI and the old GitHub Pages URLs

`.github/workflows/site.yml` type-checks and builds the site, then runs `npm run check-links` (every
relative link and `#fragment` must resolve in `dist/`) and `npm run check-stubs` (see below) on every
PR touching this package. Cloudflare deploys the site; the workflow does not.

The site used to live at `https://ianmstevenson.github.io/b-oss/`. Store listings and released
b-mobile builds link there, so that address stays up **permanently** as redirect stubs:

- `stubs/redirects.mjs` lists the old pages (frozen: never add new pages) and where each goes on
  `https://b-oss.dev`. `astro.stubs.config.mjs` turns the list into tiny meta-refresh pages
  (`npm run build:stubs` -> `dist-stubs/`).
- `check-stubs` fails the build if a stub points at a page that no longer exists, so a page can't be
  renamed or removed without a decision about its old URL.
- The `deploy-stubs` job publishes `dist-stubs/` to GitHub Pages. It needs repo variable
  `PAGES_DEPLOY=true` and Settings -> Pages -> Source = "GitHub Actions"; trigger it from the Actions
  tab (it also runs on pushes that change this package).

Hygiene the build provides: `sitemap-index.xml` (`@astrojs/sitemap`, with the real `.html` URLs),
`robots.txt`, a canonical link and Open Graph tags per page, and a `404.html`. `site` in
`astro.config.mjs` is `https://b-oss.dev` (override with `SITE_URL`).

## Status page (`status.html`)

The unofficial Blipfoto status page (b-oss#476). The page itself is static HTML (`src/pages/status.astro`);
`src/status/` is a small client script (plain TypeScript, hand-built SVG, no framework) that fetches
**one** JSON snapshot from the b-status Worker and draws everything from it. The design record is
`packages/b-status/design/` (temporary screenshots and a README listing where the build differs
from them).

```
src/status/types.ts     the snapshot shape, copied by hand from packages/b-status/src/snapshot.ts
src/status/logic.ts     pure logic: formatting, refresh gating and back-off, chart geometry (unit-tested)
src/status/now.ts       the "Now" card and headline        lanes.ts   the 48-hour lanes and axis
src/status/history.ts   the daily/weekly history graphs     tables.ts  uptime table and incident list
src/status/readout.ts   pop-up (wide) / readout card with Earlier/Later (phones)
src/status/share.ts     the "Share a problem" form (UI and client state; posts to the Worker)
src/status/fixtures.ts  fixture snapshots (all-good, api-down, both-down, unknown, stale, busy, new)
```

- **Settings** (build-time, Astro `PUBLIC_*`): `PUBLIC_STATUS_URL` (default
  `https://b-status.b-oss.workers.dev/v1/status`) and `PUBLIC_TURNSTILE_SITE_KEY` (empty = a placeholder
  box, and the Share button needs no token). Put them in `packages/b-site/.env`.
- **Preview a state without a monitor:** `npm run dev -w @b-oss/b-site`, then open
  `/status.html?fixture=api-down` (any name in `fixtures.ts`). Fixtures are honoured in dev builds only.
- **One request per load, no timers.** The Refresh button may fetch again once 60 seconds have passed
  since the last fetch (data can change between probes, because of shared problems); `next_refresh_at`
  only drives the "Next check due about HH:MM" label and the stale rule. If the data can't be loaded
  the page says so and never shows "working".
- **Shares appear immediately.** A 201 from the shares endpoint carries the full updated aggregates
  (`{ ok: true, shares: { hours, days } }`); the page swaps them into its loaded snapshot and redraws
  the Shared lanes, with no refetch.
- **Share POST** goes to `<origin of PUBLIC_STATUS_URL>/v1/shares` as `text/plain` JSON, so the browser
  sends no CORS preflight.
- **Blipfoto support links** are the two constants in `src/blipfoto-links.ts` (general help, and the
  support-request form); change them there. The Turnstile box stays a placeholder until
  `PUBLIC_TURNSTILE_SITE_KEY` is set.
