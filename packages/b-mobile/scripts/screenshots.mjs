// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Captures every b-mobile screen in headless Chromium at phone size, for UX review passes.
//
//   cd packages/b-mobile && npx vite --port 5191 --host 127.0.0.1 &      # VITE_DEV_TOKEN from the
//   node scripts/screenshots.mjs [outDir] [baseUrl]                      # repo-root .env.local
//
// The dev token signs the browser build in as a real account (read-only data is fetched from the
// live API via vite's proxy), so screens show real content. Entry/user/tag screens use the first
// entry found on /browse. Output defaults to ~/dev/tmp/b-mobile-screenshots/<date>/. Needs the
// playwright-core + cached Chromium already on this machine (see the repo CLAUDE.md).

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const date = new Date().toISOString().slice(0, 10);
const outDir = process.argv[2] ?? join(homedir(), 'dev/tmp/b-mobile-screenshots', date);
const base = process.argv[3] ?? 'http://127.0.0.1:5191';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on(
  'console',
  (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 200)}`),
);

async function settle(ms = 1500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

// Discover real ids from the browse grid.
await page.goto(`${base}/browse`);
await settle(3000);
const entryHref = await page.evaluate(() => {
  const a = document.querySelector('a[href*="/entry/"]');
  return a ? new URL(a.href).pathname : null;
});
// Thumbnails are buttons, not links, so this finds nothing; 5000000000 is the stub's first entry.
const entryId = entryHref?.match(/\/entry\/([^/]+)/)?.[1] ?? '5000000000';
console.log('entry', entryId);

const routes = [
  ['browse', '/browse'],
  ['search', '/search'],
  ['map', '/map'],
  ...(entryId
    ? [
        ['entry', `/entry/${entryId}`],
        ['entry-photo', `/entry/${entryId}/photo`],
        ['entry-metadata', `/entry/${entryId}/metadata`],
        ['entry-edit', `/entry/${entryId}/edit`],
        ['entry-report', `/entry/${entryId}/report`],
      ]
    : []),
  ['compose', '/compose'],
  ['compose-details', '/compose/details'],
  ['compose-description', '/compose/description'],
  ['compose-location', '/compose/location'],
  ['uploads', '/uploads'],
  ['me', '/me'],
  ['me-requests', '/me/requests'],
  ['me-refused', '/me/refused'],
  ['me-awards', '/me/awards'],
  ['notifications', '/notifications'],
  ['comments', '/comments'],
  ['settings', '/settings'],
  ['settings-general', '/settings/general'],
  ['settings-journal', '/settings/journal'],
  ['settings-profile', '/settings/profile'],
  ['settings-browsing', '/settings/browsing'],
  ['settings-notifications', '/settings/notifications'],
  ['settings-misc', '/settings/misc'],
  ['help', '/help'],
  ['accounts', '/accounts'],
  ['hidden', '/hidden'],
  ['sign-in', '/sign-in'],
];

const manifest = [];
let i = 0;
for (const [name, path] of routes) {
  i++;
  const file = `${String(i).padStart(2, '0')}-${name}.png`;
  problems.length = 0;
  await page.goto(`${base}${path}`);
  await settle();
  await page.screenshot({ path: join(outDir, file) });
  manifest.push({ file, path, title: await page.title(), problems: [...problems] });
  console.log(file, problems.length ? `(${problems.length} problems)` : '');
}

// Side menu open, from the browse screen.
await page.goto(`${base}/browse`);
await settle();
const burger = page.locator('ion-menu-button').first();
if (await burger.count()) {
  await burger.click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(outDir, `${String(++i).padStart(2, '0')}-side-menu.png`) });
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
console.log('written to', outDir);
