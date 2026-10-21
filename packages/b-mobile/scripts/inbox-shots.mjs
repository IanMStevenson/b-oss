// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Notifications + Comments inboxes with unread dots showing: the dots come from the badge count
// captured when the screen mounts, so the app must load (and fetch totals) before navigating
// in-app; a direct URL load mounts with a zero badge. Usage: node scripts/inbox-shots.mjs outDir baseUrl
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, base] = [process.argv[2], process.argv[3]];
const stubPort = process.env.STUB_PORT ?? '5192';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript((stubPort) => {
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
}, stubPort);
for (const [name, path] of [
  ['notifications', '/notifications'],
  ['comments', '/comments'],
]) {
  const page = await ctx.newPage();
  await page.goto(`${base}/browse`);
  await page.waitForTimeout(4000);
  await page.evaluate((p) => {
    history.pushState({}, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  await page.close();
}
await browser.close();
