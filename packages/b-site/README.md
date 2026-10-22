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
src/components/            Header (nav), Footer, Hero, CtaBand, FeatureItem
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

`.github/workflows/site.yml` builds the site, type-checks it and runs `npm run check-links`
(every relative link and `#fragment` must resolve in `dist/`) on every PR touching this package.
The GitHub Pages deploy job is switched off (repo variable `PAGES_DEPLOY` unset) because the site is
moving to Cloudflare at `https://b-oss.dev`; see the issues under #478.

Hygiene the build provides: `sitemap-index.xml` (`@astrojs/sitemap`, with the real `.html` URLs),
`robots.txt`, a canonical link and Open Graph tags per page, and a `404.html`. `site` in
`astro.config.mjs` is `https://b-oss.dev` (override with `SITE_URL`).
