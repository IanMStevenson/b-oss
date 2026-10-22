import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Flat `page.html` output keeps every existing URL byte-for-byte (the Play and Chrome Web Store
// listings and the shipped b-mobile app link to the `.html` URLs). Internal links are relative,
// so the site works from any sub-path.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://b-oss.dev',
  build: { format: 'file' },
  trailingSlash: 'never',
  // Keep whitespace as authored: collapsing it changes inline spacing.
  compressHTML: false,
  integrations: [
    sitemap({
      filter: (page) => !/\/404(\.html)?$/.test(page),
      // The integration lists routes as `/b-api`; our real URLs (and canonicals) are `/b-api.html`.
      serialize: (item) => ({ ...item, url: item.url.replace(/\/([^/.]+)$/, '/$1.html') }),
    }),
  ],
});
