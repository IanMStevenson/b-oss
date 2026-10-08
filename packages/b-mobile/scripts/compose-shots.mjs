// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Compose / edit-entry page check against the stub API (same setup as screenshots.mjs: stub +
// vite running). Seeds a draft, then screenshots the page at the top and scrolled to the end, and
// logs where the primary button sits relative to the viewport bottom. SAFE_AREA="34,48" imitates
// the insets Capacitor's SystemBars injects on a real phone.
//
//   STUB_PORT=5411 SAFE_AREA=34,48 node scripts/compose-shots.mjs <outDir> http://127.0.0.1:5412

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:5191';
const stubPort = process.env.STUB_PORT ?? '5192';
const [insetTop, insetBottom] = (process.env.SAFE_AREA ?? '0,0').split(',');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript(
  ([stubPort, t, b]) => {
    // A stylesheet rule, not an inline style: the app rewrites the root's style attribute.
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `:root { --safe-area-inset-top: ${t}px; --safe-area-inset-bottom: ${b}px; }`;
      document.head.appendChild(style);
    });
    if (localStorage.getItem('b-mobile:accounts')) return;
    localStorage.setItem(
      'b-mobile:accounts',
      JSON.stringify({
        accounts: [
          {
            id: 'cyclopstest',
            username: 'cyclopstest',
            avatarUrl: `http://127.0.0.1:${stubPort}/img/cyclopstest/avatar.jpg`,
            appTokenScope: 'read,write',
            hasServiceToken: false,
            notificationRegistrationId: null,
            notificationStatus: null,
          },
        ],
        activeAccountId: 'cyclopstest',
      }),
    );
  },
  [stubPort, insetTop, insetBottom],
);
await ctx.route('https://api.maptiler.com/**', (route) =>
  route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      version: 8,
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dfe8df' } }],
    }),
  }),
);
const page = await ctx.newPage();
const settle = async (ms = 1500) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};

for (const [mode, path, button] of [
  ['publish', '/compose/details', 'Publish'],
  ['edit', '/entry/5000000000/edit', 'Save'],
]) {
  await page.goto(`${base}/browse`);
  await settle(2500);
  await page.evaluate(
    async ({ mode, photoUrl }) => {
      const { useComposeDraftStore } = await import('/src/state/composeDraftStore.ts');
      useComposeDraftStore.getState().setDraft({
        mode,
        accountId: 'cyclopstest',
        entryId: mode === 'edit' ? '5000000000' : undefined,
        photo: {
          webPath: photoUrl,
          mimeType: 'image/jpeg',
          width: 1200,
          height: 800,
          createdAt: null,
          sizeBytes: 400000,
        },
        title: 'Morning light',
        tags: 'light, morning',
        description: 'Out before [b]work[/b].',
        date: '2026-10-07',
        location: { lat: 51.45, lon: -2.6 },
        displayLocation: true,
        thumbnailCrop: null,
        dirty: false,
      });
    },
    { mode, photoUrl: `http://127.0.0.1:${stubPort}/img/3/full.jpg` },
  );
  await page.evaluate((p) => {
    history.pushState({}, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await settle(2500);
  await page.screenshot({ path: join(outDir, `${mode}-top.png`) });
  await page.evaluate(async () => {
    const el = await [...document.querySelectorAll('ion-content')].pop().getScrollElement();
    el.scrollTo(0, el.scrollHeight);
  });
  await page.waitForTimeout(600);
  const box = await page.getByRole('button', { name: button }).boundingBox();
  console.log(
    mode,
    button,
    'bottom edge',
    box && Math.round(box.y + box.height),
    'of',
    860 - Number(insetBottom),
  );
  await page.screenshot({ path: join(outDir, `${mode}-bottom.png`) });
}
await browser.close();
