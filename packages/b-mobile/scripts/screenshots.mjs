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
const stubPort = process.env.STUB_PORT ?? '5192'; // where scripts/stub-api.mjs is listening
// SAFE_AREA="34,48" (top,bottom px) imitates the system-bar insets Capacitor's SystemBars plugin
// injects on a real phone, so clearance of bottom controls can be checked in the browser.
const [insetTop, insetBottom] = (process.env.SAFE_AREA ?? '').split(',');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
if (insetBottom) {
  await ctx.addInitScript(
    ([t, b]) => {
      const root = document.documentElement;
      root.style.setProperty('--safe-area-inset-top', `${t}px`);
      root.style.setProperty('--safe-area-inset-bottom', `${b}px`);
    },
    [insetTop || '0', insetBottom],
  );
}
// Two accounts, so the header's account switcher and the Accounts screen show their multi-account
// states (the switcher is hidden with fewer than two). The dev-token sign-in adds/refreshes the
// first; the second has no token, as an account needing a sign-in would.
await ctx.addInitScript((stubPort) => {
  if (localStorage.getItem('b-mobile:accounts')) return;
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
      accounts: [acct('cyclopstest', 'read,write'), acct('gbradley', 'read')],
      activeAccountId: 'cyclopstest',
    }),
  );
}, stubPort);

// maptiler is unreachable from here; a style with only a background keeps the map layout (pins,
// controls, popups) reviewable.
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
  ['user-profile', '/user/gbradley'],
  ['user-followers', '/user/gbradley/followers'],
  ['user-following', '/user/gbradley/following'],
  ['user-awards', '/user/gbradley/awards'],
  ['tag-entries', '/tag/light'],
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
  ['settings-app-general', '/settings/app'],
  ['help', '/help'],
  ['help-licences', '/help/licences'],
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

// Screens that need a state rather than a URL.
async function shot(name) {
  await page.screenshot({ path: join(outDir, `${String(++i).padStart(2, '0')}-${name}.png`) });
  console.log(name);
}
async function clickText(text) {
  const el = page.getByText(text, { exact: true }).first();
  if (await el.count()) {
    await el.click().catch(() => {});
    await settle(1200);
    return true;
  }
  return false;
}

// Browse tabs.
for (const [tabIndex, tab] of [
  'recent',
  'following',
  'me',
  'popular',
  'milestones',
  'new',
  'nearby',
].entries()) {
  if (tabIndex === 0) continue;
  await page.goto(`${base}/browse`);
  await settle(2000);
  // `value` is a property, not an attribute, so pick by position (Recent is index 0).
  const seg = page.locator('ion-segment-button').nth(tabIndex);
  if (await seg.count()) {
    await seg
      .first()
      .click()
      .catch(() => {});
    await settle(1500);
    await shot(`browse-tab-${tab}`);
  }
}

// Profile tabs (own and another member's).
for (const [label, path] of [
  ['own', '/me'],
  ['other', '/user/gbradley'],
]) {
  for (const tab of ['Entries', 'Faves']) {
    await page.goto(`${base}${path}`);
    await settle(2000);
    // The stat row also says "Entries", so aim at the tab button itself.
    const tabBtn = page.locator('ion-segment-button', { hasText: tab }).first();
    if (await tabBtn.count()) {
      await tabBtn.click().catch(() => {});
      await settle(1200);
      await shot(`profile-${label}-${tab.toLowerCase()}`);
    }
  }
}

// Compose with a draft photo, by driving the app's own draft store through vite's module graph.
async function seedDraft(mode, patch = {}) {
  await page.goto(`${base}/browse`);
  await settle(1500);
  await page.evaluate(
    async ({ mode, patch, photoUrl }) => {
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
        description: 'Out before work.',
        date: '2026-10-07',
        location: { lat: 51.45, lon: -2.6 },
        displayLocation: true,
        thumbnailCrop: null,
        dirty: false,
        ...patch,
      });
    },
    { mode, patch, photoUrl: `http://127.0.0.1:${stubPort}/img/3/full.jpg` },
  );
  // Client-side navigation keeps the in-memory draft (a reload would drop it).
  return async (path) => {
    await page.evaluate((p) => {
      history.pushState({}, '', p);
      dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await settle(1800);
  };
}
{
  const go = await seedDraft('publish');
  await go('/compose/details');
  await shot('compose-details-with-photo');
  // Date row expanded to its month grid.
  await page.getByRole('button', { name: /^Date:/ }).click();
  await settle(1500);
  await shot('compose-details-date-open');
  // Scrolled to the end: Publish must sit clear of the bottom inset.
  await page.evaluate(async () => {
    const scroller = document
      .querySelector('ion-content')
      ?.shadowRoot?.querySelector('.inner-scroll');
    scroller?.scrollTo(0, scroller.scrollHeight);
  });
  await settle(500);
  await shot('compose-details-bottom');
  await go('/compose/location');
  await shot('compose-location-with-pin');
}
{
  const go = await seedDraft('edit');
  await go('/entry/5000000000/edit');
  await shot('entry-edit-with-draft');
}

// Upload queue with items in every state, by driving uploadQueueStore through vite's module graph
// (same trick as the draft above; the store's own persist() writes to prefs, harmless here).
{
  await page.goto(`${base}/browse`);
  await settle(1500);
  await page.evaluate(async () => {
    const { useUploadQueueStore } = await import('/src/state/uploadQueueStore.ts');
    const now = Date.now();
    const base = {
      accountId: 'cyclopstest',
      filePath: null,
      fileMimeType: null,
      fields: {},
      attempts: 0,
      nextAttemptAt: null,
      error: null,
      resultEntryId: null,
    };
    useUploadQueueStore.setState({
      hydrated: true,
      items: [
        {
          ...base,
          id: 'q1',
          kind: 'publish',
          status: 'uploading',
          displayTitle: 'Harbour at dusk',
          createdAt: now,
        },
        {
          ...base,
          id: 'q2',
          kind: 'publish',
          status: 'waiting',
          displayTitle: 'Morning light',
          createdAt: now - 1000,
        },
        {
          ...base,
          id: 'q3',
          kind: 'edit',
          entryId: '5000000000',
          status: 'waiting',
          displayTitle: 'A title long enough that it will need to be truncated on a phone screen',
          createdAt: now - 2000,
        },
        {
          ...base,
          id: 'q4',
          kind: 'publish',
          status: 'failed',
          attempts: 6,
          error: 'Could not reach Blipfoto. Check your connection.',
          displayTitle: 'Blurry cat',
          createdAt: now - 3000,
        },
        {
          ...base,
          id: 'q5',
          kind: 'publish',
          status: 'uploaded',
          resultEntryId: '5000000000',
          displayTitle: 'Sunrise',
          createdAt: now - 4000,
        },
      ],
    });
  });
  await page.evaluate(() => {
    history.pushState({}, '', '/uploads');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await settle(1500);
  await shot('uploads-with-items');
}

// Search with results / no results, and the people tab; Map with several entry pins and with one
// opened popup (focused entry).
{
  const typeQuery = async (text) => {
    await page.goto(`${base}/search`);
    await settle(1500);
    await page.getByPlaceholder('Search…').fill(text);
    await page.keyboard.press('Enter');
    await settle(2000);
  };
  await typeQuery('light');
  await shot('search-results');
  await page.locator('ion-segment-button', { hasText: 'People' }).first().click();
  await settle(1500);
  await shot('search-people-results');
  await typeQuery('zzzz');
  await shot('search-no-results');
  await page.locator('ion-segment-button', { hasText: 'People' }).first().click();
  await settle(1500);
  await shot('search-people-no-results');

  await page.goto(`${base}/browse`);
  await settle(1500);
  await page.evaluate(async () => {
    const { resumeSet } = await import('/src/data/resumeCache.ts');
    resumeSet('map:view', { center: [-2.5, 51.55], zoom: 8 });
  });
  await page.evaluate(() => {
    history.pushState({}, '', '/map');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await settle(3000);
  await shot('map-with-pins');
  await page.goto(`${base}/map?entry=5000000000`);
  await settle(3000);
  await shot('map-popup');
}

// Account switcher open, and side menu.
await page.goto(`${base}/browse`);
await settle(2000);
const switcher = page.locator('[aria-label^="Switch account"]').first();
if (await switcher.count()) {
  await switcher.click().catch(() => {});
  await page.waitForTimeout(800);
  await shot('account-switcher-open');
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
