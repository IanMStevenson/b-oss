# b-site

The b-oss project website: a static [Astro](https://astro.build) site, no client-side framework.
It builds to plain HTML, so the output is as simple and fast as hand-written pages.

## Editing

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

## Deploying

`.github/workflows/site.yml` builds the site on every PR touching this package and, on merge to
`main`, deploys it to GitHub Pages. This needs repo **Settings → Pages → Source: GitHub Actions**.
