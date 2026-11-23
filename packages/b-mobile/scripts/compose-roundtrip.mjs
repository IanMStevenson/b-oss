// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Real-browser round trip for the edit screen (b-oss#1056): add an extra photo (held in the draft),
// turn "Add to map" on, pick a place, come back, and check the extra is still there, at once and
// without the website being read again. Runs against the stub API and a vite dev server (setup as in
// flow-runner.mjs), with a FAKE desktop bridge standing in for the Electron shell's `site` host and
// file dialog, so the extras block is offered and the website read takes a (slow, counted) 2.5 s.
//
//   node scripts/stub-api.mjs 5611 &
//   B_API_PROXY_TARGET=http://127.0.0.1:5611 VITE_DEV_TOKEN=stubtoken npx vite --port 5612 --host 127.0.0.1 &
//   STUB_PORT=5611 node scripts/compose-roundtrip.mjs <outDir> http://127.0.0.1:5612
//
// Exit code 1 when the extra is missing at any check.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:5612';
const stubPort = process.env.STUB_PORT ?? '5611';
if (!outDir) throw new Error('usage: compose-roundtrip.mjs <outDir> [baseUrl]');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript((stubPort) => {
  if (!localStorage.getItem('b-mobile:accounts')) {
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
  }
  const store = new Map();
  const quiet = () => Promise.resolve();
  const never = () => () => {};
  window.__siteCalls = [];
  window.bMobileDesktop = {
    version: 1,
    secure: {
      get: (k) => Promise.resolve(store.get(k) ?? null),
      set: (k, v) => (store.set(k, v), quiet()),
      remove: (k) => (store.delete(k), quiet()),
    },
    openAuth: () => Promise.reject(new Error('cancelled')),
    notify: {
      configure: quiet,
      status: () => Promise.resolve({ accounts: [] }),
      checkNow: () => Promise.resolve({ accounts: [] }),
      sendTest: () => Promise.resolve({ ok: true, detail: '' }),
      onReceived: never,
      onTapped: never,
    },
    diagnostics: { logError: quiet, openLogFolder: quiet, copyText: quiet },
    async pickPhoto() {
      const c = document.createElement('canvas');
      c.width = 2000;
      c.height = 1500;
      const g = c.getContext('2d');
      g.fillStyle = `hsl(${(window.__siteCalls.length * 70 + 200) % 360} 60% 50%)`;
      g.fillRect(0, 0, 2000, 1500);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg'));
      return {
        name: 'extra.jpg',
        mimeType: 'image/jpeg',
        modifiedMs: Date.now(),
        bytes: new Uint8Array(await blob.arrayBuffer()),
      };
    },
    site: {
      signIn: () => Promise.resolve(true),
      signOut: quiet,
      async runPage(run) {
        window.__siteCalls.push(run.url);
        await new Promise((r) => setTimeout(r, run.url.includes('/settings') ? 50 : 2500));
        const result = run.url.includes('/settings')
          ? { status: 'ok', user: 'cyclopstest' }
          : {
              status: 'ok',
              items: [{ id: 'x1', thumbnail: `http://127.0.0.1:${stubPort}/img/3/thumb.jpg` }],
              remaining: 90,
            };
        return { finalUrl: run.url, result: JSON.stringify(result) };
      },
    },
  };
}, stubPort);
await ctx.route('https://maps.geoapify.com/**', (route) =>
  route.fulfill({
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dfe8df"/></svg>',
  }),
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const settle = async (ms = 800) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });
const extraShown = () =>
  page
    .getByAltText('New extra photo 1')
    .count()
    .then((n) => n > 0);
let failed = false;
const check = (label, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
};

await page.goto(`${base}/browse`);
await settle(2500);
await page.evaluate(() => {
  history.pushState({}, '', '/entry/5000000000/edit');
  dispatchEvent(new PopStateEvent('popstate'));
});
await page.getByAltText('Extra photo 1').waitFor({ timeout: 15000 });
await page.getByLabel('Add an extra photo').click();
await page.getByAltText('New extra photo 1').waitFor({ timeout: 5000 });
await shot('1-extra-added');

const toggle = page.locator('ion-toggle[aria-label="Add to map"]');
await toggle.scrollIntoViewIfNeeded();
// The stub's entry already shows on the map, so turn it off and on again: turning it on opens the picker.
if (await toggle.evaluate((el) => el.checked)) {
  await toggle.click();
  await page.waitForTimeout(500);
}
await toggle.click();
await page.waitForURL('**/compose/location', { timeout: 10000 }).catch(async (e) => {
  await shot('debug-toggle');
  throw e;
});
await settle(1500);
const map = page.locator('.location-map');
const box = await map.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(300);
await shot('2-location-picker');
await page.getByText('Done', { exact: true }).click();
await page.waitForURL('**/entry/5000000000/edit', { timeout: 10000 });

await page.waitForTimeout(150);
check('extra shown 150 ms after coming back', await extraShown());
await shot('3-back-150ms');
await page.waitForTimeout(3500);
check('extra shown once everything has loaded', await extraShown());
await shot('4-back-settled');
const editReads = (await page.evaluate(() => window.__siteCalls)).filter((u) =>
  u.includes('/edit'),
);
check(
  `the entry's edit page was read once, not again after the trip (reads: ${editReads.length})`,
  editReads.length === 1,
);
check('no page errors', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
