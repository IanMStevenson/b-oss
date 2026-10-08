// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Lightbox fit/zoom check against the stub API: opens /entry/<id>/photo for a portrait and a
// landscape entry at phone and desktop sizes, logs the rendered image box before and after a
// double-click zoom, and saves screenshots. Same setup as screenshots.mjs (stub + vite running).
//
//   STUB_PORT=5421 node scripts/lightbox-shots.mjs <outDir> http://127.0.0.1:5422

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:5191';
const stubPort = process.env.STUB_PORT ?? '5192';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const sizes = { phone: { width: 412, height: 860 }, desktop: { width: 1280, height: 720 } };
// stub: every third entry (index % 3 === 2) is portrait
const entries = { landscape: '5000000001', portrait: '5000000002' };

for (const [sizeName, viewport] of Object.entries(sizes)) {
  const ctx = await browser.newContext({
    viewport,
    isMobile: sizeName === 'phone',
    hasTouch: sizeName === 'phone',
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((stubPort) => {
    const acct = (u, scope) => ({
      id: u,
      username: u,
      avatarUrl: `http://127.0.0.1:${stubPort}/img/${u}/avatar.jpg`,
      appTokenScope: scope,
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
    });
    localStorage.setItem(
      'b-mobile:accounts',
      JSON.stringify({
        accounts: [acct('cyclopstest', 'read,write')],
        activeAccountId: 'cyclopstest',
      }),
    );
  }, stubPort);
  const page = await ctx.newPage();
  for (const [orient, id] of Object.entries(entries)) {
    await page.goto(`${base}/entry/${id}/photo`);
    await page.waitForSelector('[role=dialog] img', { timeout: 15000 });
    await page.waitForTimeout(1200);
    const box = () =>
      page.evaluate(() => {
        const r = document.querySelector('[role=dialog] img').getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round);
      });
    console.log(sizeName, orient, 'fit', await box());
    await page.screenshot({ path: join(outDir, `${sizeName}-${orient}-fit.png`) });
    const c = { x: viewport.width / 2, y: viewport.height / 2 };
    await page.mouse.dblclick(c.x, c.y);
    await page.waitForTimeout(800);
    console.log(sizeName, orient, 'zoomed', await box());
    await page.screenshot({ path: join(outDir, `${sizeName}-${orient}-zoom.png`) });
  }
  await ctx.close();
}
await browser.close();
