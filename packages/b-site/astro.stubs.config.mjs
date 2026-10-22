import { defineConfig } from 'astro/config';
import { redirects } from './stubs/redirects.mjs';

// Builds ONLY redirect stubs for the old GitHub Pages URLs (see stubs/redirects.mjs). Astro turns
// each entry into a tiny HTML page (meta refresh + canonical link to the new URL).
// `npm run build:stubs` -> dist-stubs/
export default defineConfig({
  srcDir: './stubs',
  publicDir: './stubs/public',
  outDir: './dist-stubs',
  build: { format: 'file' },
  trailingSlash: 'never',
  redirects,
});
