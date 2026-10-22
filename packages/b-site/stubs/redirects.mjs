// Every URL the GitHub Pages site (https://ianmstevenson.github.io/b-oss/) has ever served that
// other things still link to. Frozen on purpose: new site pages must NOT be added here, as they
// never existed on the old host. The stubs are permanent (released b-mobile builds hard-code the
// privacy URL; store listings link to these pages).
export const NEW_ORIGIN = 'https://b-oss.dev';

const pages = [
  'b-api',
  'b-ark',
  'b-ark-chrome-guide',
  'b-ark-chrome-privacy',
  'b-ark-guide',
  'b-ark-versions',
  'b-mobile',
  'b-mobile-data-deletion',
  'b-mobile-privacy',
  'contact',
];

/**
 * Keys have no extension: with `build.format: 'file'` Astro writes `b-api.html`, which GitHub Pages
 * serves at both `/b-api` and `/b-api.html`. The root route writes `index.html`.
 */
export const redirects = {
  '/': `${NEW_ORIGIN}/`,
  ...Object.fromEntries(pages.map((p) => [`/${p}`, `${NEW_ORIGIN}/${p}.html`])),
};
