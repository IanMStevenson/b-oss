// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Lens 2 of the b-mobile main-vs-integration test (b-oss#770, rerun in b-oss#772): drives the same
// scripted flows in headless Chromium against any build of b-mobile and records a TRACE per flow:
// (a) the API requests the stub received (method, path, params, body shape), (b) the final route,
// (c) persisted state (localStorage, prefs), (d) console errors, plus per-step pass/fail. Run it
// once per build against the same stub, then diff with scripts/flow-diff.mjs.
//
//   node scripts/stub-api.mjs 5193 &
//   B_API_PROXY_TARGET=http://127.0.0.1:5193 VITE_DEV_TOKEN=stubtoken npx vite --port 5195 --host 127.0.0.1 &
//   STUB_PORT=5193 node scripts/flow-runner.mjs <outDir> http://127.0.0.1:5195 [flow,flow...]
//
// VITE_DEV_TOKEN must be set (any value): the stub accepts it, and it is how a flow signs in.
// Flow ids follow docs/BEHAVIOUR.md. Conventions follow scripts/screenshots.mjs (412x860 @2x,
// stub, geoapify tiles faked). `prefs-seed` writes <outDir>/prefs-seed.json when run on the build
// whose stored prefs should be migrated; `prefs-migration` reads it via PREFS_SEED=<file>.
// Nothing here fixes anything: it records.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:5195';
const only = process.argv[4]?.split(',');
const stubPort = process.env.STUB_PORT ?? '5193';
const stub = `http://127.0.0.1:${stubPort}`;
const seedFile = process.env.PREFS_SEED;
if (!outDir) throw new Error('usage: flow-runner.mjs <outDir> [baseUrl] [flow,flow...]');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

async function stubJson(path) {
  return (await fetch(`${stub}${path}`)).json();
}

/** A fresh phone-size context: nothing stored, so the dev token signs `cyclopstest` in. */
async function newSession({ initStorage } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 860 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  if (initStorage) {
    await ctx.addInitScript((entries) => {
      // Only on the very first load of the context, so a flow's own writes survive reloads.
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, initStorage);
  }
  await ctx.route('https://maps.geoapify.com/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dfe8df"/></svg>',
    }),
  );
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 240)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text().slice(0, 240);
    // A failed fetch of a fixture photo from the stub origin is not an app error.
    if (/Failed to load resource/.test(text) && /5193|geoapify/.test(text)) return;
    consoleErrors.push(`console: ${text}`);
  });
  return { ctx, page, consoleErrors };
}

const settle = async (page, ms = 1200) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};

/** Client-side navigation (keeps in-memory stores, unlike page.goto). */
async function go(page, path, ms = 1500) {
  await page.evaluate((p) => {
    history.pushState({}, '', p);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await settle(page, ms);
}

/** Loads the app signed in as cyclopstest (dev token), optionally with a second, token-less account
 * (as screenshots.mjs does) so the switcher and Accounts screen show their multi-account states. */
async function boot(session, { second = false } = {}) {
  const { page } = session;
  await page.goto(`${base}/browse`);
  await settle(page, 2500);
  if (second) {
    await page.evaluate((stubPort) => {
      const raw = JSON.parse(localStorage.getItem('b-mobile:accounts') ?? '{"accounts":[]}');
      if (!raw.accounts.some((a) => a.id === 'gbradley')) {
        raw.accounts.push({
          id: 'gbradley',
          username: 'gbradley',
          avatarUrl: `http://127.0.0.1:${stubPort}/img/gbradley/avatar.jpg`,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        });
        localStorage.setItem('b-mobile:accounts', JSON.stringify(raw));
      }
    }, stubPort);
    await page.reload();
    await settle(page, 2500);
  }
}

async function clickByText(page, text, opts = {}) {
  const el = page.getByText(text, { exact: opts.exact ?? true }).first();
  if (!(await el.count())) throw new Error(`no element with text "${text}"`);
  await el.click({ timeout: 4000 });
  await settle(page, opts.wait ?? 1000);
}
async function clickLabel(page, label, opts = {}) {
  const el = page.locator(`[aria-label="${label}"]`).first();
  if (!(await el.count())) throw new Error(`no element labelled "${label}"`);
  await el.click({ timeout: 4000 });
  await settle(page, opts.wait ?? 1000);
}
/** Confirms whatever Ionic overlay is up (account-confirm gate, action sheets, alerts), preferring
 * the button whose text matches `prefer`. Returns the button text clicked, or null if none up. */
async function confirmOverlay(page, prefer) {
  const buttons = page.locator(
    'ion-alert:not(.overlay-hidden) button, ion-action-sheet:not(.overlay-hidden) button, ion-popover:not(.overlay-hidden) button, ion-modal:not(.overlay-hidden) button',
  );
  if (!(await buttons.count())) return null;
  const texts = (await buttons.allTextContents()).map((t) => t.trim());
  let idx = prefer ? texts.findIndex((t) => prefer.test(t)) : -1;
  if (idx < 0) idx = texts.findIndex((t) => !/cancel|close|no\b/i.test(t) && t);
  if (idx < 0) return null;
  await buttons.nth(idx).click({ timeout: 3000 });
  await settle(page, 1000);
  return texts[idx];
}

const visibleOverlayButtons = async (page) =>
  (
    await page
      .locator(
        'ion-alert:not(.overlay-hidden) button, ion-action-sheet:not(.overlay-hidden) button, ion-popover:not(.overlay-hidden) button, ion-modal:not(.overlay-hidden) button',
      )
      .allTextContents()
  ).map((t) => t.trim());

const STEP_LIMIT_MS = 15000;
let stepLimit = STEP_LIMIT_MS;

/** Flow registry: id -> { plan, run(session, step, note) }. `step` never throws: a failing step is
 * recorded (so a selector that exists on one build only is itself a diff). */
const flows = [];
const flow = (id, plan, run, opts = {}) => flows.push({ id, plan, run, opts });

// ---- Account flows ------------------------------------------------------------------------

flow(
  'FLW-01-02-sign-in-out',
  'Sign in via dev token, then sign out (remove the account)',
  async (s, step, note) => {
    await step('boot (dev-token sign-in)', () => boot(s));
    await step('accounts screen lists cyclopstest', async () => {
      await go(s.page, '/accounts');
      if (!(await s.page.getByText('cyclopstest').count())) throw new Error('account not listed');
    });
    await step('open account options', () => clickLabel(s.page, 'Account options for cyclopstest'));
    note('options-overlay-buttons', await visibleOverlayButtons(s.page));
    await step('choose Remove', async () => {
      await s.page
        .locator('ion-action-sheet:not(.overlay-hidden) button', { hasText: 'Disconnect account' })
        .click({ timeout: 4000 });
      await settle(s.page, 800);
    });
    note('remove-confirm-buttons', await visibleOverlayButtons(s.page));
    await step('confirm removal', async () =>
      note('confirm-clicked', await confirmOverlay(s.page, /disconnect|remove|yes|confirm/i)),
    );
    note(
      'accounts-after-remove',
      await s.page.evaluate(() => localStorage.getItem('b-mobile:accounts')),
    );
  },
);

flow(
  'FLW-20-21-22-accounts',
  'Two accounts: switch, mode change (options), remove the second',
  async (s, step, note) => {
    await step('boot with second account', () => boot(s, { second: true }));
    await step('accounts screen', () => go(s.page, '/accounts'));
    note(
      'rows',
      (await s.page.locator('ion-item').allTextContents()).map((t) => t.trim()),
    );
    await step('switch to gbradley (tap row)', () =>
      clickByText(s.page, 'gbradley', { exact: false }),
    );
    await step('confirm switch', async () => note('switch-confirm', await confirmOverlay(s.page)));
    note(
      'active-after-switch',
      await s.page.evaluate(
        () => JSON.parse(localStorage.getItem('b-mobile:accounts') ?? '{}').activeAccountId,
      ),
    );
    await step('browse as gbradley', () => go(s.page, '/browse', 2500));
    await step('open options for cyclopstest', async () => {
      await go(s.page, '/accounts');
      await clickLabel(s.page, 'Account options for cyclopstest');
    });
    note('mode-options', await visibleOverlayButtons(s.page));
    await step('dismiss', () => s.page.keyboard.press('Escape'));
    await step('add account entry point', async () => {
      await go(s.page, '/accounts');
      await clickByText(s.page, 'Add account', { exact: false });
    });
    note('add-account-overlay', await visibleOverlayButtons(s.page));
    note('route-after-add', new URL(s.page.url()).pathname);
  },
);

// ---- Prefs --------------------------------------------------------------------------------

const PREFS_STORAGE_KEY = 'b-mobile:device-prefs';
const PREF_CALLS = [
  ['setConfirmAccountBeforeReaction', false],
  ['setUploadFullSize', false],
  ['setOpenBlipfotoLinksInApp', true],
  ['setNotificationPollingIntervalMinutes', 15],
  ['setSeenFirstRunExplainer', true],
  ['setShowZoomBar', false],
  ['setShowPagination', false],
  ['setThumbnailMargins', 'narrow'],
  ['setThumbnailZoomPercent', 140],
  ['setPhotoFit', 'capped'],
  ['setAccountAvatarStyle', 'initial'],
  ['setTheme', 'dark'],
];

const readPrefs = (page) =>
  page.evaluate(async () => {
    const { useDevicePrefsStore } = await import('/src/state/devicePrefsStore.ts');
    const st = useDevicePrefsStore.getState();
    const effective = {};
    for (const [k, v] of Object.entries(st)) if (typeof v !== 'function') effective[k] = v;
    return { effective, stored: localStorage.getItem('b-mobile:device-prefs') };
  });

flow(
  'PREFS-seed',
  'On the build whose stored prefs are to be migrated: change every pref through the real setters and save what that build persisted (writes prefs-seed.json)',
  async (s, step, note) => {
    await step('boot', () => boot(s));
    const seeds = {};
    // Seed A: every pref changed. Seed B: untouched (what a user who never opened Settings has).
    // Seed C: only the theme changed.
    await step('A: change every pref', async () => {
      await s.page.evaluate(async (calls) => {
        const { useDevicePrefsStore } = await import('/src/state/devicePrefsStore.ts');
        const st = useDevicePrefsStore.getState();
        for (const [fn, v] of calls) st[fn](v);
        st.setReminder('cyclopstest', { enabled: true, time: '20:30', days: [1, 2, 3] });
      }, PREF_CALLS);
      await s.page.waitForTimeout(500);
      seeds.A = await s.page.evaluate((k) => localStorage.getItem(k), PREFS_STORAGE_KEY);
    });
    await step('C: only theme', async () => {
      await s.page.evaluate((k) => localStorage.removeItem(k), PREFS_STORAGE_KEY);
      await s.page.reload();
      await settle(s.page, 2000);
      await s.page.evaluate(async () => {
        const { useDevicePrefsStore } = await import('/src/state/devicePrefsStore.ts');
        useDevicePrefsStore.getState().setTheme('mid');
      });
      await s.page.waitForTimeout(400);
      seeds.C = await s.page.evaluate((k) => localStorage.getItem(k), PREFS_STORAGE_KEY);
    });
    await step('B: untouched, as stored after a first hydrate', async () => {
      await s.page.evaluate((k) => localStorage.removeItem(k), PREFS_STORAGE_KEY);
      await s.page.reload();
      await settle(s.page, 2000);
      seeds.B = await s.page.evaluate((k) => localStorage.getItem(k), PREFS_STORAGE_KEY);
    });
    // D: a hand-built 1.2.1-era "full object of every pref" blob with the pre-#549 shape (no theme).
    seeds.D = JSON.stringify({
      confirmAccountBeforeReaction: false,
      reminders: {},
      uploadFullSize: true,
      openBlipfotoLinksInApp: false,
      notificationPollingIntervalMinutes: 10,
      seenFirstRunExplainer: true,
      showZoomBar: true,
      showPagination: true,
      thumbnailMargins: 'none',
      thumbnailZoomPercent: 100,
      photoFit: 'full-width',
      accountAvatarStyle: 'picture',
      legacyUnknownKey: 'x',
    });
    seeds.E = '{not json';
    writeFileSync(join(outDir, 'prefs-seed.json'), JSON.stringify(seeds, null, 2));
    note('seeds-written', Object.fromEntries(Object.entries(seeds).map(([k, v]) => [k, v])));
  },
);

flow(
  'PREFS-migration',
  'Load stored prefs seeded from the other build (PREFS_SEED): effective values, what is persisted after hydrate, and after one further change',
  async (s0, step, note) => {
    if (!seedFile) throw new Error('set PREFS_SEED=<prefs-seed.json>');
    const seeds = JSON.parse(readFileSync(seedFile, 'utf8'));
    for (const [name, raw] of Object.entries(seeds)) {
      if (raw === null) {
        note(`seed ${name}`, 'null (nothing stored)');
        continue;
      }
      const s = await newSession({ initStorage: { [PREFS_STORAGE_KEY]: raw } });
      try {
        await step(`seed ${name}: load`, async () => {
          await boot(s);
          const r = await readPrefs(s.page);
          note(`seed ${name} stored-before`, JSON.parse(JSON.stringify(raw)));
          note(`seed ${name} effective`, r.effective);
          note(`seed ${name} stored-after-hydrate`, r.stored);
        });
        await step(`seed ${name}: change theme to light, reload`, async () => {
          await s.page.evaluate(async () => {
            const { useDevicePrefsStore } = await import('/src/state/devicePrefsStore.ts');
            useDevicePrefsStore.getState().setTheme('light');
          });
          await s.page.reload();
          await settle(s.page, 2000);
          const r = await readPrefs(s.page);
          note(`seed ${name} after-change effective.theme`, r.effective.theme);
          note(`seed ${name} after-change stored`, r.stored);
        });
        s0.consoleErrors.push(...s.consoleErrors.map((e) => `[seed ${name}] ${e}`));
      } finally {
        await s.ctx.close();
      }
    }
  },
);

flow(
  'FLW-17-settings',
  'Settings edits through the real UI (appearance, then profile/notification calls)',
  async (s, step, note) => {
    await step('boot', () => boot(s));
    await step('appearance: theme Dark', async () => {
      await go(s.page, '/settings/appearance');
      await s.page.locator('ion-segment-button', { hasText: 'Dark' }).first().click();
      await settle(s.page, 600);
    });
    await step('appearance: zoom bar off', () =>
      s.page.locator('ion-toggle[aria-label="Show zoom/navigation bar"]').click(),
    );
    await step('appearance: pagination off', () =>
      s.page.locator('ion-toggle[aria-label="Show pagination"]').click(),
    );
    await step('appearance: margins None', () =>
      s.page.locator('ion-segment-button', { hasText: 'None' }).first().click(),
    );
    await step('appearance: photo size Fit to screen', () =>
      s.page.locator('ion-segment-button', { hasText: 'Fit to screen' }).first().click(),
    );
    await step('appearance: open links in app on', () =>
      s.page.locator('ion-toggle[aria-label="Open blipfoto.com links in this app"]').click(),
    );
    note(
      'appearance-rows',
      (await s.page.locator('ion-item').allTextContents()).map((t) => t.trim().slice(0, 50)),
    );
    note('prefs-after-appearance', (await readPrefs(s.page)).stored);
    await step('settings index', async () => {
      await go(s.page, '/settings');
      note(
        'settings-index',
        (await s.page.locator('ion-item').allTextContents()).map((t) => t.trim()),
      );
    });
    for (const section of ['Details & journal', 'Profile', 'Notification settings', 'Reminders']) {
      await step(`open ${section}`, async () => {
        await go(s.page, '/settings');
        await clickByText(s.page, section, { exact: true, wait: 1800 });
        note(`${section} route`, new URL(s.page.url()).pathname);
        note(
          `${section} toggles`,
          await s.page
            .locator('ion-toggle')
            .evaluateAll((els) =>
              els.map((e) => `${e.getAttribute('aria-label') ?? ''}=${e.checked}`),
            ),
        );
      });
    }
    await step('notifications: toggle first push toggle', async () => {
      await go(s.page, '/settings/notifications');
      const t = s.page.locator('ion-toggle').first();
      if (await t.count()) await t.click();
      await settle(s.page, 1200);
    });
    await step('notifications: toggle first feed toggle', async () => {
      const t = s.page.locator('ion-toggle').nth(3);
      if (await t.count()) await t.click();
      await settle(s.page, 1200);
    });
  },
);

// ---- Browse, search, tag, map -------------------------------------------------------------

flow(
  'FLW-04-14-browse-search-tag-map',
  'Browse tabs, search, tag entries, map',
  async (s, step) => {
    await step('boot', () => boot(s));
    for (const [i, tab] of [
      'Recent',
      'Following',
      'Me',
      'Popular',
      'Milestones',
      'New',
      'Nearby',
    ].entries()) {
      await step(`browse tab ${tab}`, async () => {
        await go(s.page, '/browse', 1200);
        await s.page.locator('ion-segment-button').nth(i).click({ timeout: 4000 });
        await settle(s.page, 1500);
      });
    }
    await step('browse: scroll to load next page', async () => {
      await go(s.page, '/browse', 2000);
      await s.page.evaluate(async () => {
        const el = await [...document.querySelectorAll('ion-content')].pop().getScrollElement();
        el.scrollTo(0, el.scrollHeight);
      });
      await settle(s.page, 1500);
    });
    await step('search: type a query', async () => {
      await go(s.page, '/search', 1500);
      const input = s.page.locator('input').first();
      await input.fill('light');
      await input.press('Enter');
      await settle(s.page, 2000);
    });
    await step('search: no results', async () => {
      const input = s.page.locator('input').first();
      await input.fill('zzz');
      await input.press('Enter');
      await settle(s.page, 1500);
    });
    await step('tag entries', () => go(s.page, '/tag/light', 2000));
    await step('map', () => go(s.page, '/map', 3500));
    await step('map: pan and zoom', async () => {
      const box = await s.page
        .locator('.leaflet-container, .maplibregl-map, [class*="map"]')
        .first()
        .boundingBox();
      if (box) {
        await s.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await s.page.mouse.down();
        await s.page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, {
          steps: 6,
        });
        await s.page.mouse.up();
      }
      await settle(s.page, 2000);
    });
    await step('profile (other member)', () => go(s.page, '/user/gbradley', 2000));
    await step('followers', () => go(s.page, '/user/gbradley/followers', 1500));
    await step('awards', () => go(s.page, '/user/gbradley/awards', 1500));
    await step('own profile', () => go(s.page, '/me', 2000));
  },
);

// ---- Entry actions ------------------------------------------------------------------------

flow(
  'FLW-05-11-entry-actions',
  'View entry, star, favourite, comment, reply, follow, hide, report',
  async (s, step, note) => {
    await step('boot', () => boot(s));
    await step('open entry', () => go(s.page, '/entry/5000000000', 2500));
    await step('star', async () => {
      await clickLabel(s.page, 'Star this entry');
      note('star-overlay', await confirmOverlay(s.page, /star|yes|confirm|ok/i));
    });
    await step('favourite', async () => {
      await clickLabel(s.page, 'Favourite this entry');
      note('fave-overlay', await confirmOverlay(s.page, /favou?rite|yes|confirm|ok/i));
    });
    await step('post a comment', async () => {
      await s.page
        .locator('.ProseMirror')
        .first()
        .pressSequentially('Test comment from the flow runner');
      await s.page
        .getByRole('button', { name: /^(Post|Send|Comment|Add comment)$/i })
        .last()
        .click();
      note('comment-overlay', await confirmOverlay(s.page));
      await settle(s.page, 1500);
    });
    await step('reply to a comment', async () => {
      await s.page.locator('button[aria-label="Reply"]').first().click();
      await settle(s.page, 800);
      // The comment editor is a ProseMirror div, not a textarea.
      await s.page
        .locator('.ProseMirror-focused')
        .last()
        .pressSequentially('Test reply', { timeout: 4000 });
      note(
        'reply-buttons',
        await s.page.locator('ion-content button, ion-content ion-button').evaluateAll((els) =>
          els
            .filter((e) => e.getClientRects().length)
            .map((e) => `${e.getAttribute('aria-label') ?? ''}|${(e.textContent ?? '').trim()}`)
            .slice(-12),
        ),
      );
      await s.page
        .locator('ion-content button', { hasText: /^Reply$/ })
        .last()
        .click({ timeout: 4000 });
      note('reply-overlay', await confirmOverlay(s.page));
      await settle(s.page, 1500);
    });
    await step('follow gbradley', async () => {
      await clickLabel(s.page, 'Follow gbradley');
      note('follow-overlay', await confirmOverlay(s.page));
    });
    await step('hide user', async () => {
      await go(s.page, '/entry/5000000001', 2500);
      await clickLabel(s.page, 'Hide user');
      note('hide-overlay', await confirmOverlay(s.page, /hide|yes|confirm|ok/i));
    });
    await step('hidden members screen', async () => {
      await go(s.page, '/hidden', 1500);
      note(
        'hidden-rows',
        (await s.page.locator('ion-item').allTextContents()).map((t) => t.trim()),
      );
    });
    await step('report entry', async () => {
      await go(s.page, '/entry/5000000002/report', 1800);
      await s.page
        .locator('ion-checkbox', { hasText: 'Copyright infringement' })
        .click({ timeout: 4000 });
      await s.page.locator('textarea').first().fill('Report note from the flow runner');
      await s.page
        .getByRole('button', { name: /^(Send report|Report|Submit|Send)$/i })
        .last()
        .click({ timeout: 4000 });
      note('report-overlay', await confirmOverlay(s.page));
      await settle(s.page, 1200);
    });
    await step('photo full-screen', async () => {
      await go(s.page, '/entry/5000000000/photo', 2500);
    });
  },
);

// ---- Compose, edit, delete ----------------------------------------------------------------

async function seedDraft(page, mode, patch = {}) {
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
        title: 'Flow runner title',
        tags: 'light, morning',
        description: 'Out before [b]work[/b].',
        date: '2026-10-07',
        location: { lat: 51.45, lon: -2.6 },
        displayLocation: true,
        thumbnailCrop: null,
        dirty: false,
        ...patch,
      });
    },
    { mode, patch, photoUrl: `${stub}/img/3/full.jpg` },
  );
}

flow(
  'FLW-12-13-compose-edit-delete',
  'Publish with a fixture photo (upload request shape), edit, delete',
  async (s, step, note) => {
    await step('boot', () => boot(s));
    await step('publish: details screen with seeded draft', async () => {
      await seedDraft(s.page, 'publish');
      await go(s.page, '/compose/details', 2500);
    });
    await step('publish: tap Publish', async () => {
      await s.page.getByRole('button', { name: 'Publish' }).last().click({ timeout: 5000 });
      note('publish-overlay', await confirmOverlay(s.page));
      await settle(s.page, 3000);
      note('route-after-publish', new URL(s.page.url()).pathname);
    });
    await step('edit: save', async () => {
      await go(s.page, '/browse', 1500);
      await seedDraft(s.page, 'edit');
      await go(s.page, '/entry/5000000000/edit', 2500);
      await s.page.getByRole('button', { name: 'Save' }).last().click({ timeout: 5000 });
      note('edit-overlay', await confirmOverlay(s.page));
      await settle(s.page, 3000);
      note('route-after-edit', new URL(s.page.url()).pathname);
    });
    await step('delete entry (own)', async () => {
      await go(s.page, '/browse', 1000);
      await seedDraft(s.page, 'edit');
      await go(s.page, '/entry/5000000000/edit', 2500);
      await s.page.getByText('Delete entry', { exact: true }).last().scrollIntoViewIfNeeded();
      await s.page.getByText('Delete entry', { exact: true }).last().click({ timeout: 4000 });
      note('delete-overlay', await confirmOverlay(s.page, /delete|yes|confirm/i));
      await settle(s.page, 1500);
    });
    await step('compose entry screens render', async () => {
      for (const p of ['/compose', '/compose/description', '/compose/location'])
        await go(s.page, p, 1200);
    });
  },
);

// ---- Inboxes ------------------------------------------------------------------------------

flow('FLW-15-inboxes', 'Notifications and comments inboxes; mark read', async (s, step, note) => {
  await step('boot', () => boot(s));
  await step('notifications inbox', () => go(s.page, '/notifications', 2500));
  await step('comments inbox', () => go(s.page, '/comments', 2500));
  await step('open first comment', async () => {
    note(
      'inbox-items',
      (await s.page.locator('ion-content ion-item, ion-content [role=button]').allTextContents())
        .map((t) => t.trim().slice(0, 40))
        .slice(-12),
    );
    await s.page.locator('button[aria-label="Open entry"]').first().click({ timeout: 4000 });
    await settle(s.page, 2000);
  });
  await step('unread badge refresh (resume)', async () => {
    await s.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await settle(s.page, 1500);
  });
});

// ---- Cold start / idle (background work must match on a handheld web profile) --------------

flow(
  'IDLE-cold-start',
  'Cold start signed in, then 20 s idle: the requests the app makes on its own (polling must not appear on handheld)',
  async (s, step) => {
    await step('boot', () => boot(s));
    stepLimit = 40000;
    await step('idle 20 s', () => s.page.waitForTimeout(20000));
  },
);

flow(
  'HELP-and-misc-routes',
  'Every remaining route loads without a console error',
  async (s, step) => {
    await step('boot', () => boot(s, { second: true }));
    for (const p of [
      '/help',
      '/help/licences',
      '/uploads',
      '/me/requests',
      '/me/refused',
      '/me/awards',
      '/settings/journal',
      '/settings/profile',
      '/hidden',
      '/sign-in',
    ]) {
      await step(`route ${p}`, () => go(s.page, p, 1500));
    }
  },
);

// ---- Run ----------------------------------------------------------------------------------

const summary = [];
for (const f of flows) {
  if (only && !only.some((o) => f.id.includes(o))) continue;
  if (f.id === 'PREFS-migration' && !seedFile) continue;
  const needsFreshSession = f.id !== 'PREFS-migration';
  const s = await newSession();
  const steps = [];
  const notes = {};
  const step = async (name, fn) => {
    const t0 = Date.now();
    try {
      await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('step timeout')), stepLimit)),
      ]);
      steps.push({ name, ok: true });
    } catch (e) {
      steps.push({
        name,
        ok: false,
        error: String(e.message ?? e)
          .split('\n')[0]
          .slice(0, 160),
      });
    }
    void t0;
  };
  const note = (k, v) => (notes[k] = v);
  await stubJson('/__log/reset');
  let flowError = null;
  try {
    await f.run(s, step, note);
  } catch (e) {
    flowError = String(e.message ?? e).split('\n')[0];
  }
  await s.page.waitForTimeout(500);
  const requests = await stubJson('/__log');
  const finalRoute = new URL(s.page.url()).pathname;
  const storage = await s.page
    .evaluate(() => {
      const out = {};
      for (const [k, v] of Object.entries(localStorage)) {
        out[k] = /token/i.test(k) ? `<redacted ${v.length} chars>` : v;
      }
      return out;
    })
    .catch(() => ({}));
  await s.page.screenshot({ path: join(outDir, `${f.id}.png`) }).catch(() => {});
  const trace = {
    flow: f.id,
    plan: f.plan,
    flowError,
    steps,
    finalRoute,
    requests,
    storage,
    consoleErrors: s.consoleErrors,
    notes,
  };
  writeFileSync(join(outDir, `${f.id}.json`), JSON.stringify(trace, null, 2));
  summary.push({
    flow: f.id,
    steps: `${steps.filter((x) => x.ok).length}/${steps.length}`,
    requests: requests.length,
    errors: s.consoleErrors.length,
    flowError,
  });
  console.log(
    f.id,
    summary.at(-1).steps,
    `${requests.length} req`,
    `${s.consoleErrors.length} console errors`,
    flowError ?? '',
  );
  await s.ctx.close();
  void needsFreshSession;
}
await browser.close();
