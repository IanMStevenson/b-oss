import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Flat `page.html` output. Cloudflare (`html_handling: "drop-trailing-slash"`, wrangler.jsonc)
// serves it at the extensionless URL and redirects `.html` requests there, so the old `.html` links
// (Play / Chrome Web Store listings, shipped b-mobile) keep working. Internal links are relative.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://b-oss.dev',
  build: { format: 'file' },
  trailingSlash: 'never',
  // Keep whitespace as authored: collapsing it changes inline spacing.
  compressHTML: false,
  integrations: [
    sitemap({
      filter: (page) => !/\/404(\.html)?$/.test(page),
    }),
  ],
});
