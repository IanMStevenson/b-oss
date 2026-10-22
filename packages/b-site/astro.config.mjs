import { defineConfig } from 'astro/config';

// Flat `page.html` output keeps every existing URL byte-for-byte (the Play and Chrome Web Store
// listings and the shipped b-mobile app link to the `.html` URLs). Internal links are relative,
// so no `base` is needed to serve from a sub-path like github.io/b-oss/.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://ianmstevenson.github.io/b-oss/',
  build: { format: 'file' },
  trailingSlash: 'never',
  compressHTML: false,
});
