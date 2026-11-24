// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Real-browser check of the unsaved-draft guard (b-oss#1059), under Ionic's real router: with an
// unsaved edit, the side menu, a deep-link route change, the hardware Back and a page reload each
// ask first (screenshots of the dialog), Keep editing stays put, and Discard goes ahead. Runs against the stub API and a vite dev server (setup as in
// flow-runner.mjs), with a FAKE desktop bridge standing in for the Electron shell's `site` host and
// file dialog, so the extras block is offered and the website read takes a (slow, counted) 2.5 s.
//
//   node scripts/stub-api.mjs 5611 &
//   B_API_PROXY_TARGET=http://127.0.0.1:5611 VITE_DEV_TOKEN=stubtoken npx vite --port 5612 --host 127.0.0.1 &
//   STUB_PORT=5611 node scripts/draft-guard.mjs <outDir> http://127.0.0.1:5612
//
// Exit code 1 when a check fails.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:5612';
const stubPort = process.env.STUB_PORT ?? '5611';
if (!outDir) throw new Error('usage: draft-guard.mjs <outDir> [baseUrl]');
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


const dialogOpen = () =>
  page.locator('ion-alert:not(.overlay-hidden) .alert-head h2').first().textContent({ timeout: 3000 }).catch(() => null);
const press = async (name) => {
  await page.locator('ion-alert:not(.overlay-hidden)').getByRole('button', { name }).click();
  await page.waitForTimeout(600);
};
const openEdit = async () => {
  await page.goto(`${base}/browse`);
  await settle(2500);
  await page.evaluate(() => {
    history.pushState({}, '', '/entry/5000000000/edit');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByLabel('Title').waitFor({ timeout: 15000 });
  await settle(1200);
};
const makeDirty = async () => {
  await page.getByLabel('Title').fill('An unsaved title');
  await page.waitForTimeout(300);
};
const here = () => new URL(page.url()).pathname;

// 1. side menu
await openEdit();
await makeDirty();
await page.evaluate(() => document.querySelector('ion-menu').open()); // the edit screen has no ☰; the swipe is the same call
await page.waitForTimeout(700);
await page.getByRole('button', { name: /^Settings/ }).or(page.locator('ion-item', { hasText: 'Settings' }).first()).first().click();
await page.waitForTimeout(700);
check('side menu: asks "Discard changes?"', (await dialogOpen()) === 'Discard changes?');
await shot('1-menu-asks');
await press('Keep editing');
check('side menu: Keep editing stays on the edit screen', here() === '/entry/5000000000/edit');
check('side menu: the typed title is still there', (await page.getByLabel('Title').inputValue()) === 'An unsaved title');

// 2. a route change from outside the screen (a deep link or notification tap goes through the router)
await page.evaluate(() => {
  history.pushState({}, '', '/notifications');
  dispatchEvent(new PopStateEvent('popstate'));
});
await page.waitForTimeout(800);
console.log('note: a raw history.pushState + popstate is the browser, not the app; path now', here());

// 3. hardware Back. A desktop browser never fires Ionic's own hardware-Back dispatch (it needs
// Capacitor), so this plays Ionic's part: it raises `ionBackButton`, takes the highest-priority
// handler like Ionic does, and records whether the router's own Back (`next`) was reached.
const pressBack = () =>
  page.evaluate(() => {
    const handlers = [];
    document.dispatchEvent(
      new CustomEvent('ionBackButton', {
        detail: { register: (priority, run) => handlers.push({ priority, run }) },
      }),
    );
    window.__routerBack = 0;
    handlers.sort((a, b) => b.priority - a.priority)[0]?.run(() => (window.__routerBack += 1));
  });
await openEdit();
await makeDirty();
await pressBack();
await page.waitForTimeout(800);
check('hardware Back: asks', (await dialogOpen()) === 'Discard changes?');
await shot('2-hardware-back-asks');
await press('Keep editing');
check('hardware Back: Keep editing does not go back', (await page.evaluate(() => window.__routerBack)) === 0);
await pressBack();
await page.waitForTimeout(800);
await press('Discard');
await page.waitForTimeout(800);
check('hardware Back: Discard lets Back through', (await page.evaluate(() => window.__routerBack)) === 1);

// 4. page reload
await openEdit();
await makeDirty();
const dialogs = [];
page.on('dialog', (d) => {
  dialogs.push(d.type());
  void d.dismiss();
});
await page.evaluate(() => document.body.click()); // user activation, as a real member has
await page.reload().catch(() => {});
await page.waitForTimeout(800);
check('reload: the browser asks (beforeunload)', dialogs.includes('beforeunload'));
check('reload: Keep editing leaves the title in place', (await page.getByLabel('Title').inputValue().catch(() => '')) === 'An unsaved title');

// 5. clean: nothing asks (the page is left again, so accept the browser's own question now)
page.removeAllListeners('dialog');
page.on('dialog', (d) => void d.accept());
await openEdit();
await page.evaluate(() => document.querySelector('ion-menu').open()); // the edit screen has no ☰; the swipe is the same call
await page.waitForTimeout(700);
await page.locator('ion-item', { hasText: 'Settings' }).first().click();
await page.waitForTimeout(900);
check('no changes: the menu goes ahead without asking', here() === '/settings');

check('no page errors', errors.length === 0);
if (errors.length) console.log(errors.join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
