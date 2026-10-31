// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// End-to-end tests for the real shell. e2e/run.sh starts Electron in Docker (CDP port from BMPC_CDP, default :9222) with
// b-mobile's stub API behind the proxy and a fake sign-in server; these tests drive its window with
// Playwright over CDP. The tests share one window and run in order: the later ones build on the
// signed-in state the sign-in test leaves.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const CDP = process.env.BMPC_CDP ?? 'http://127.0.0.1:9222';
const OUT = process.env.BMPC_E2E_OUT ?? join(__dirname, '..', 'e2e-out');
const USER_DATA = process.env.BMPC_E2E_USER_DATA;

// A 1x1 transparent PNG, standing in for every map tile.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let browser: Browser;
let page: Page;

const text = (): Promise<string> => page.evaluate(() => document.body.innerText);
const go = async (path: string, settleMs = 3500): Promise<void> => {
  await page.evaluate((p) => location.assign(p), path);
  await page.waitForTimeout(settleMs);
};
const shot = async (name: string): Promise<void> => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};
const clickIonButton = (label: RegExp): Promise<void> =>
  page.evaluate((source) => {
    const re = new RegExp(source, 'i');
    ([...document.querySelectorAll('ion-button')] as HTMLElement[])
      .find((b) => re.test(b.innerText))
      ?.click();
  }, label.source);

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  if (!context) throw new Error('The shell has no browser context');
  page = context.pages()[0] ?? (await context.waitForEvent('page'));
  // The map's raster tiles come from a third-party host that the dev VM blocks and that tests must not
  // depend on: answer every tile request with a one-pixel PNG.
  await context.route(/^https:\/\/maps\.geoapify\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }),
  );
  await page.waitForLoadState('load');
  await page.waitForTimeout(3000);
});

afterAll(async () => {
  await browser?.close();
});

describe('the shell and its security posture', () => {
  it('serves the app from its own origin with the bridge and no Node in the page', async () => {
    expect(page.url()).toMatch(/^app:\/\/b-mobile\//);
    expect(await page.evaluate(() => window.bMobileDesktop?.version)).toBe(1);
    expect(
      await page.evaluate(() => [typeof require, typeof process, typeof module].join(',')),
    ).toBe('undefined,undefined,undefined');
  });

  it('reports the same build as the web files, and shows no mismatch notice (b-oss#696)', async () => {
    const shellBuild = await page.evaluate(
      async () => (await window.bMobileDesktop?.shell.info())?.build,
    );
    expect(shellBuild).toMatch(/^\d+\.\d+\.\d+/);
    expect(await page.locator('[role="alert"]').count()).toBe(0);
    await go('/help', 3000);
    const body = await text();
    expect(body).toContain('App version');
    expect(body).toContain('Desktop program version');
    expect(body).not.toContain('(differs)');
    expect(body).toContain(shellBuild as string);
  });

  it('sends a CSP that allows the inline theme script by hash only', async () => {
    const csp = await page.evaluate(async () =>
      (await fetch('/')).headers.get('content-security-policy'),
    );
    expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("object-src 'none'");
  });

  it('404s a missing asset and never serves files from outside the web build', async () => {
    const status = await page.evaluate(async () => (await fetch('/assets/nope.js')).status);
    expect(status).toBe(404);
    const body = await page.evaluate(async () => (await fetch('/%2e%2e/%2e%2e/etc/passwd')).text());
    expect(body).not.toContain('root:');
  });

  it('refuses sign-in windows for other hosts and for non-custom-scheme redirects', async () => {
    const attempt = (url: string, prefix: string): Promise<string> =>
      page.evaluate(
        async (args: { u: string; p: string }) => {
          try {
            await window.bMobileDesktop?.openAuth(args.u, args.p);
            return 'opened';
          } catch (e) {
            return (e as Error).message;
          }
        },
        { u: url, p: prefix },
      );
    expect(await attempt('https://evil.example/x', 'bmobile://oauth/')).toContain('allowed host');
    expect(await attempt('https://www.blipfoto.com/oauth/authorize', 'https://x/')).toContain(
      'custom-scheme',
    );
  });

  it('denies browser permission prompts other than location', async () => {
    const result = await page.evaluate(() => Notification.requestPermission());
    expect(result).toBe('denied');
  });

  it('does not deny location for the app origin (the OS provider may still fail)', async () => {
    // b-oss#672. Whether a position comes back depends on the machine's location provider, which a
    // container does not have; the permission itself must not be the reason for a failure (code 1).
    const result = await page.evaluate(
      () =>
        new Promise<string>((resolve) =>
          navigator.geolocation.getCurrentPosition(
            () => resolve('position'),
            (e) => resolve(`error:${e.code}`),
            { timeout: 8000 },
          ),
        ),
    );
    expect(result).not.toBe('error:1');
  });
});

describe('browsing', () => {
  it('loads the feed through the app-origin proxy', async () => {
    await go('/browse', 5000);
    const body = await text();
    expect(body).not.toMatch(/Can.t reach|offline/i);
    // The stub API's usernames appear in the grid.
    expect(body.split('\n').filter((l) => l.trim().length > 2).length).toBeGreaterThan(10);
    await shot('1-browse');
  });
});

describe('sign-in and secrets', () => {
  it('offers no "Use browser to sign in" setting on desktop', async () => {
    await go('/sign-in');
    expect(await page.locator('ion-toggle[aria-label="Use browser to sign in"]').count()).toBe(0);
    await shot('2-sign-in');
  });

  it('signs in through the embedded window and lands on Accounts', async () => {
    await clickIonButton(/continue/);
    await page.waitForTimeout(2000);
    await clickIonButton(/got it/); // the first-run explainer
    await page.waitForFunction(() => location.pathname === '/accounts', undefined, {
      timeout: 30_000,
    });
    const body = await text();
    expect(body).toContain('cyclopstest');
    expect(body).toContain('Read-write');
    await shot('3-accounts');
  });

  it('keeps the token in the secure store, and the account survives a reload', async () => {
    if (USER_DATA) {
      const file = join(USER_DATA, 'secure-store.json');
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8')).toContain('token:cyclopstest:app');
    }
    await page.reload();
    await page.waitForLoadState('load');
    await go('/accounts', 0);
    await page.waitForFunction(() => document.body.innerText.includes('cyclopstest'), undefined, {
      timeout: 15_000,
    });
    expect(await text()).toContain('cyclopstest');
  });
});

// Capabilities on desktop (b-oss#636, b-oss#670): no OS location (controls absent rather than dead) and a
// webcam instead of a camera app, and the location picker (lazy chunk, map) opens without the error screen.
describe('desktop capabilities: location and camera', () => {
  it('New entry offers the webcam and choosing a file, and no Android picker copy (b-oss#670)', async () => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await go('/compose', 3000);
    const body = await text();
    expect(body).toContain('Take a photo');
    expect(body).toContain('Choose from device');
    expect(body).not.toMatch(/system picker/i);
    // The buttons keep a natural width and the group is centred in the content area, not stretched
    // across a wide window (b-oss#671). With the camera there are two; a lone picker is the same rule.
    const box = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('ion-button.new-entry-tile')].map((t) =>
        t.getBoundingClientRect(),
      );
      const content = document.querySelector('.new-entry-tiles')?.getBoundingClientRect();
      if (tiles.length === 0 || !content) return null;
      const left = Math.min(...tiles.map((t) => t.left));
      const right = Math.max(...tiles.map((t) => t.right));
      return {
        maxWidth: Math.max(...tiles.map((t) => t.width)),
        offset: (left + right) / 2 - (content.left + content.width / 2),
      };
    });
    expect(box?.maxWidth).toBeLessThan(330);
    expect(Math.abs(box?.offset ?? 999)).toBeLessThan(4);
    await shot('7-new-entry');
  });

  it('takes a photo with the (fake) webcam end to end into the compose form (b-oss#670)', async () => {
    await go('/compose', 3000);
    await clickIonButton(/take a photo/);
    await page.waitForSelector('video[data-testid="webcam-video"]:not([hidden])', {
      timeout: 15000,
    });
    await page.waitForFunction(
      () =>
        (document.querySelector('video[data-testid="webcam-video"]') as HTMLVideoElement)
          .videoWidth > 0,
      undefined,
      { timeout: 15000 },
    );
    await shot('7b-webcam-live');
    await clickIonButton(/^take photo$/);
    await page.waitForSelector('img[alt="The photo you just took"]', { timeout: 10000 });
    await shot('7c-webcam-review');
    await clickIonButton(/use photo/);
    await page.waitForFunction(() => location.pathname.includes('/compose/details'), undefined, {
      timeout: 10000,
    });
    await page.waitForTimeout(1500);
    const photo = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('img[alt="Thumbnail"]');
      return img ? { src: img.src.slice(0, 5), w: img.naturalWidth } : null;
    });
    expect(photo?.src).toBe('blob:');
    expect(photo?.w).toBeGreaterThan(0);
    await shot('7d-webcam-compose');
  });

  it('grants the camera only: the microphone is refused (b-oss#670)', async () => {
    const result = await page.evaluate(() =>
      navigator.mediaDevices.getUserMedia({ audio: true }).then(
        () => 'granted',
        (e: DOMException) => `denied:${e.name}`,
      ),
    );
    expect(result).toBe('denied:NotAllowedError');
  });

  it('the location picker offers "Show current location"; a failed attempt gives a message and hides it (b-oss#672)', async () => {
    await go('/compose/location', 4000);
    expect(await text()).not.toMatch(/Something went wrong/i);
    const control = page.getByLabel('Show current location');
    expect(await control.count()).toBe(1);
    await shot('8-location-picker');
    // Click it directly (dispatchEvent), so nothing drawn over the map can intercept the click.
    await control.dispatchEvent('click');
    // A container has no OS location provider, so the attempt fails; the outcome is what matters:
    // either way no error screen, and a failure leaves the message and no control.
    await page.waitForFunction(
      () =>
        /Windows location is off/.test(document.body.innerText) ||
        document.querySelector('[aria-label="Show current location"]') !== null,
      undefined,
      { timeout: 25000 },
    );
    expect(await text()).not.toMatch(/Something went wrong/i);
    if (/Windows location is off/.test(await text())) {
      expect(await control.count()).toBe(0);
    }
    await shot('8b-location-picker-after-tap');
  });

  it('the map offers "My location" until a first attempt fails', async () => {
    await go('/map', 4000);
    expect(await text()).not.toMatch(/Something went wrong/i);
    const hidden = /Windows location is off/.test(await text());
    expect(await page.getByLabel('My location').count()).toBe(hidden ? 0 : 1);
  });

  // b-oss#669 on the Leaflet map: a window wide enough to show more than one copy of the world at the
  // default zoom makes Leaflet report longitudes beyond +/-180, which the API (and the stub, like it)
  // rejects with form.min_lon_invalid. The requests must carry in-range values and the screen must
  // not show the "could not load entries" message.
  it('the map on a wide window asks the API for in-range longitudes only (b-oss#669)', async () => {
    const searches: string[] = [];
    const onRequest = (req: { url(): string }): void => {
      if (req.url().includes('entries/search')) searches.push(req.url());
    };
    page.on('request', onRequest);
    try {
      await page.setViewportSize({ width: 2400, height: 900 });
      await page.evaluate(() => sessionStorage.clear());
      await go('/map', 5000);
      // The map is drawn (tiles answered by the test) and Leaflet really is showing several worlds.
      expect(await text()).not.toContain('couldn’t be displayed');
      const widthDegrees = await page.evaluate(() => {
        const c = document.querySelector<HTMLElement>('.leaflet-container');
        return c ? (c.clientWidth / 1024) * 360 : 0;
      });
      expect(widthDegrees).toBeGreaterThan(360);
      await page.waitForFunction(
        () => document.querySelector('.leaflet-tile-loaded') !== null,
        undefined,
        {
          timeout: 15000,
        },
      );
      await page.waitForTimeout(2000);
      expect(searches.length).toBeGreaterThan(0);
      for (const url of searches) {
        const q = new URL(url).searchParams;
        for (const key of ['min_lon', 'max_lon']) {
          const v = q.get(key);
          if (v !== null) expect(Math.abs(Number(v))).toBeLessThanOrEqual(180);
        }
      }
      expect(await text()).not.toMatch(/Could not load entries/);
      await shot('8c-map-wide-window');
    } finally {
      page.off('request', onRequest);
      await page.setViewportSize({ width: 1200, height: 800 });
    }
  });

  it('Nearby explains there is no location here and offers the map instead of "Allow location"', async () => {
    await go('/browse', 4000);
    await page.evaluate(() => {
      document
        .querySelector('ion-segment')
        ?.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'nearby' } }));
    });
    await page.waitForTimeout(1000);
    const body = await text();
    expect(body).toContain('Open the map');
    expect(body).not.toContain('Allow location');
  });
});

// Responsive navigation (b-oss#638): beside the page on a wide window, collapsed on Browse and
// Entry, a remembered pin overrides both ways, and the drawer below the breakpoint.
describe('responsive navigation menu', () => {
  const visible = (): Promise<boolean> =>
    page.evaluate(
      () =>
        document.querySelector('ion-split-pane')?.classList.contains('split-pane-visible') ?? false,
    );
  const pin = async (label: string): Promise<void> => {
    await page.getByText(label, { exact: true }).first().click();
    await page.waitForTimeout(500);
  };

  it('is open beside the page on Accounts and Settings, collapsed on Browse', async () => {
    await page.setViewportSize({ width: 1300, height: 800 });
    await go('/accounts', 2500);
    expect(await visible()).toBe(true);
    expect(await text()).toContain('Collapse menu');
    await shot('9-nav-accounts-open');
    await go('/settings', 2500);
    expect(await visible()).toBe(true);
    await shot('10-nav-settings-open');
    await go('/browse', 4000);
    expect(await visible()).toBe(false);
    await shot('11-nav-browse-collapsed');
  });

  it('a pin forces it open on Browse, closed on Accounts, and is remembered across a reload', async () => {
    await go('/browse', 3000);
    await page.locator('ion-menu-button').first().click(); // the drawer, from the header
    await page.waitForTimeout(600);
    await shot('12a-nav-drawer-opened');
    await pin('Keep menu open');
    expect(await visible()).toBe(true);
    await shot('12-nav-browse-pinned-open');
    await page.reload();
    await page.waitForLoadState('load');
    await go('/browse', 3500);
    expect(await visible()).toBe(true);

    await pin('Collapse menu'); // undo: back to automatic
    await go('/accounts', 2500);
    expect(await visible()).toBe(true);
    await pin('Collapse menu');
    expect(await visible()).toBe(false);
    await shot('13-nav-accounts-pinned-closed');
    await page.locator('ion-menu-button').first().click();
    await page.waitForTimeout(600);
    await pin('Keep menu open'); // back to automatic again
    expect(await visible()).toBe(true);
  });

  it('is the drawer on a narrow window', async () => {
    await page.setViewportSize({ width: 800, height: 800 });
    await go('/accounts', 2500);
    expect(await visible()).toBe(false);
    expect(await text()).not.toContain('Collapse menu');
    await page.setViewportSize({ width: 1300, height: 800 });
  });
});

// The stub API logs every avatar upload it receives ("avatar upload: N bytes body, filename=...,
// type=..., content-type header=..."); run.sh writes that log to e2e-out/stub-api.log.
function stubUploads(): { bytes: number; type: string; contentType: string }[] {
  const log = readFileSync(join(OUT, 'stub-api.log'), 'utf8');
  return [
    ...log.matchAll(
      /avatar upload: (\d+) bytes body, filename=[^,]*, type=([^,]*), content-type header=(\S+)/g,
    ),
  ].map((m) => ({ bytes: Number(m[1]), type: m[2] ?? '', contentType: m[3] ?? '' }));
}

describe('uploads through the proxy', () => {
  for (const megabytes of [0.5, 2.5, 8]) {
    it(`sends a ${megabytes} MB multipart body intact`, async () => {
      const before = stubUploads().length;
      const status = await page.evaluate(async (mb) => {
        const size = Math.round(mb * 1024 * 1024);
        const bytes = new Uint8Array(size);
        bytes[0] = 0xff;
        bytes[1] = 0xd8;
        bytes[size - 2] = 0xff;
        bytes[size - 1] = 0xd9;
        const form = new FormData();
        form.append('avatar', new Blob([bytes], { type: 'image/jpeg' }), 'photo.jpg');
        const res = await fetch('/api/blipfoto/4/user/settings.json', {
          method: 'PUT',
          body: form,
          headers: { Authorization: 'Bearer e2e' },
        });
        return res.status;
      }, megabytes);
      expect(status).toBe(200);

      // What reached the API: the whole file plus only multipart framing, as a JPEG part, under a
      // multipart content type (so the boundary header survived the proxy).
      const received = stubUploads().slice(before);
      expect(received).toHaveLength(1);
      const fileBytes = Math.round(megabytes * 1024 * 1024);
      expect(received[0]?.bytes).toBeGreaterThanOrEqual(fileBytes);
      expect(received[0]?.bytes).toBeLessThan(fileBytes + 2000);
      expect(received[0]?.type).toBe('image/jpeg');
      expect(received[0]?.contentType).toBe('multipart/form-data');
    });
  }
});

// Desktop notifications by polling (b-oss#610). The shell polls the stub API every second here
// (BMPC_TEST_POLL_INTERVAL_MS) and records what it would have shown instead of showing it
// (BMPC_TEST_NOTIFY_PORT); the stub's counts are raised and lowered over its /__unread control URL.
// The tests run in order and build on the account the sign-in tests left signed in.
// The container this run started (e2e/run.sh gives each run its own, b-oss#683).
const CONTAINER = process.env.BMPC_E2E_CONTAINER ?? 'bmpc-e2e-shell';
const STUB = process.env.BMPC_STUB ?? 'http://127.0.0.1:5192';
const NOTIFY = process.env.BMPC_NOTIFY ?? 'http://127.0.0.1:5194';

interface Shown {
  title: string;
  body: string;
  count: number;
  payload: { kind: string; stream?: string; accountId: string } | null;
}
const shown = async (): Promise<Shown[]> =>
  (await fetch(`${NOTIFY}/shown`)).json() as Promise<Shown[]>;
const setUnread = async (comments: number, notifications: number): Promise<void> => {
  await fetch(`${STUB}/__unread?comments=${comments}&notifications=${notifications}`);
};
const settle = (ms = 3500): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const flipToggle = (label: string, checked: boolean): Promise<unknown> =>
  page.evaluate(
    (args) =>
      document
        .querySelector(`ion-toggle[aria-label="${args.label}"]`)
        ?.dispatchEvent(
          new CustomEvent('ionChange', { bubbles: true, detail: { checked: args.checked } }),
        ),
    { label, checked },
  );

describe('desktop notifications by polling', () => {
  it('is a plain setting: no second sign-in, nothing "unavailable", and the tray is explained', async () => {
    await setUnread(2, 3);
    await go('/settings/notifications', 4000);
    const body = await text();
    expect(body).not.toMatch(/aren.t available in this build/i);
    expect(body).toContain('system tray');
    // Turning notifications on opens no sign-in window and asks for nothing.
    await flipToggle('New comments', true);
    await flipToggle('New notifications', true);
    await settle(1500);
    expect(page.url()).toContain('/settings/notifications');
    await shot('4-notifications-on');
  });

  it('records the starting counts without announcing them', async () => {
    await settle();
    expect(await shown()).toEqual([]);
  });

  it('shows one OS notification per rise, with the window open', async () => {
    await setUnread(5, 3); // +3 comments
    await settle();
    expect(await shown()).toEqual([
      expect.objectContaining({
        body: 'cyclopstest: 3 new comments',
        count: 3,
        payload: { kind: 'activity', stream: 'comments', accountId: 'cyclopstest' },
      }),
    ]);
    await settle(); // several more polls with unchanged counts: still just the one
    expect(await shown()).toHaveLength(1);

    await setUnread(5, 4); // +1 notification
    await settle();
    const list = await shown();
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({
      body: 'cyclopstest: 1 new notification',
      payload: { stream: 'notifications' },
    });
  });

  it('says nothing for a stream switched off, and no catch-up when it is switched back on', async () => {
    await flipToggle('New notifications', false);
    await settle(1500);
    const before = (await shown()).length;
    await setUnread(5, 9); // notifications rise while off
    await settle();
    expect(await shown()).toHaveLength(before);
    await flipToggle('New notifications', true);
    await settle();
    expect(await shown()).toHaveLength(before); // already counted while it was off
    await setUnread(6, 9); // the comments stream is still on
    await settle();
    const list = await shown();
    expect(list).toHaveLength(before + 1);
    expect(list.at(-1)?.payload).toMatchObject({ stream: 'comments' });
  });

  it('shows when it last checked and when it will next, and Check now polls at once (b-oss#673)', async () => {
    await go('/settings/notifications', 4000);
    const line = (): Promise<string> =>
      page.evaluate(
        () => document.querySelector('[data-testid="notify-status"]')?.textContent ?? '',
      );
    expect(await line()).toMatch(/^Checked (just now|a minute ago|\d+ minutes? ago) · next check /);
    expect(await line()).toContain('Nothing new');
    await shot('7-notification-status');
    const before = (await shown()).length;
    await setUnread(7, 9); // +1 comment
    await page.getByRole('button', { name: 'Check now' }).click();
    await page.waitForTimeout(1500);
    expect(await shown()).toHaveLength(before + 1);
    expect(await line()).toMatch(/1 new, 1 notification\(s\) shown|Nothing new/);
  });

  it('Send a test notification shows a toast with no API involved, and logs the result (b-oss#677)', async () => {
    const before = (await shown()).length;
    await page.getByRole('button', { name: 'Send a test notification' }).click();
    await page.waitForSelector('[data-testid="notify-test-result"]', { timeout: 10_000 });
    const list = await shown();
    expect(list).toHaveLength(before + 1);
    expect(list.at(-1)).toMatchObject({ title: 'b-mobile test notification', payload: null });
    await shot('8-test-notification');
  });

  it('writes the pipeline to app.log: start-up facts, polls, decisions, the test toast; no secrets', () => {
    expect(USER_DATA, 'run through e2e/run.sh').toBeTruthy();
    const log = readFileSync(join(USER_DATA ?? '', 'logs', 'app.log'), 'utf8');
    for (const expected of [
      '"source":"notify"',
      'start: version=',
      'Notification.isSupported()=',
      'poller started',
      'configured: accounts=[cyclopstest(comments,notifications)]',
      'poll baseline account=cyclopstest',
      'poll ok account=cyclopstest',
      'stream=comments new=3: showing',
      'stream=notifications new=',
      'suppressed, stream is switched off',
      'notifications on: 1 account(s) watched',
      'login item: left alone',
      'check now requested',
      'test notification: ok',
    ]) {
      expect(log, expected).toContain(expected);
    }
    expect(log).not.toMatch(/Bearer|access_token/i);
  });

  it('a click routes to the right screen', async () => {
    await go('/browse', 2500);
    const list = await shown();
    const index = list.findIndex((n) => n.payload?.stream === 'notifications');
    expect((await fetch(`${NOTIFY}/click/${index}`, { method: 'POST' })).status).toBe(200);
    await page.waitForFunction(() => location.pathname === '/notifications', undefined, {
      timeout: 10_000,
    });
    const last = list.map((n) => n.payload?.stream).lastIndexOf('comments');
    await fetch(`${NOTIFY}/click/${last}`, { method: 'POST' });

    await page.waitForFunction(() => location.pathname === '/comments', undefined, {
      timeout: 10_000,
    });
  });

  it('a dead token raises exactly one sign-in-again notification, and a click opens Accounts', async () => {
    const before = (await shown()).length;
    await fetch(`${STUB}/__token-dead?on=1`);
    await settle(5000);
    const after = await shown();
    const reauth = after.slice(before).filter((n) => n.payload?.kind === 'reauth-required');
    expect(reauth).toHaveLength(1);
    expect(reauth[0]?.body).toMatch(/Sign in again/);
    await settle(); // polling that account has stopped: still just the one
    expect((await shown()).filter((n) => n.payload?.kind === 'reauth-required')).toHaveLength(1);
    await fetch(`${STUB}/__token-dead?on=0`);

    const index = after.findIndex((n) => n.payload?.kind === 'reauth-required');
    await fetch(`${NOTIFY}/click/${index}`, { method: 'POST' });
    await page.waitForFunction(() => location.pathname === '/accounts', undefined, {
      timeout: 10_000,
    });
    expect(page.url()).toContain('reauth=cyclopstest');
    await shot('5-reauth');
  });
});

describe('the error log and copyable details (b-oss#639)', () => {
  const logFile = (): string =>
    USER_DATA ? join(USER_DATA, 'logs', 'app.log') : join(OUT, 'no-user-data');
  const readLog = (): string => (existsSync(logFile()) ? readFileSync(logFile(), 'utf8') : '');

  it('logs an unhandled page error with its token redacted', async () => {
    expect(USER_DATA, 'run through e2e/run.sh').toBeTruthy();
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error(
          'lookup failed: access_token=SECRETVALUE9 Authorization: Bearer abcDEF123456',
        );
      }, 0);
    });
    await page.waitForTimeout(1500);
    const log = readLog();
    expect(log).toContain('lookup failed');
    expect(log).toContain('"source":"window-error"');
    expect(log).not.toContain('SECRETVALUE9');
    expect(log).not.toContain('abcDEF123456');
  });

  it('shows the message with Copy details and Open log folder when a render fails', async () => {
    // Reach the app's error boundary through React's fiber tree and hand it an error exactly as React
    // does for a failed render (getDerivedStateFromError, then componentDidCatch): a genuinely failing
    // render cannot be forced from outside without changing the app.
    await page.evaluate(() => {
      const root = document.getElementById('root') as unknown as Record<string, unknown>;
      const key = Object.keys(root).find((k) => k.startsWith('__reactContainer'));
      type Fiber = { stateNode?: unknown; child?: Fiber | null; sibling?: Fiber | null };
      const find = (f: Fiber | null | undefined): Fiber | null => {
        for (let n = f; n; n = n.sibling) {
          const inst = n.stateNode as { componentDidCatch?: unknown } | null;
          if (inst && typeof inst.componentDidCatch === 'function') return n;
          const hit = find(n.child);
          if (hit) return hit;
        }
        return null;
      };
      const fiber = find(root[key ?? ''] as Fiber);
      if (!fiber) throw new Error('no error boundary found');
      const inst = fiber.stateNode as {
        constructor: { getDerivedStateFromError(e: Error): object };
        setState(s: object): void;
        componentDidCatch(e: Error, i: { componentStack: string }): void;
      };
      const error = new Error('forced render failure token=SECRETVALUE9');
      inst.setState(inst.constructor.getDerivedStateFromError(error));
      inst.componentDidCatch(error, { componentStack: '\n    in ForcedFailure' });
    });
    await page.waitForSelector('[role="alert"]', { timeout: 10_000 });
    const body = await text();
    expect(body).toContain('Something went wrong');
    expect(body).toContain('forced render failure');
    expect(body).not.toContain('SECRETVALUE9');
    expect(body).toContain('Copy details');
    expect(body).toContain('Open log folder');
    await shot('6-error-screen');
    await page.waitForTimeout(500);
    const log = readLog();
    expect(log).toContain('"source":"boundary"');
    expect(log).toContain('forced render failure');
    expect(log).not.toContain('SECRETVALUE9');
    // Copy details goes through the bridge to the real clipboard.
    await page.getByRole('button', { name: 'Copy details' }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Copied'), undefined, {
      timeout: 5000,
    });
  });
});

// Browse zoom (b-oss#635): on a wide window with the desktop profile's 156px tile the control must
// keep stepping, Ctrl+wheel and Ctrl +/-/0 drive the app's own zoom, and Chromium's page zoom
// (devicePixelRatio) never moves. Chromium's own page-zoom accelerators come from the application
// menu, which CDP key events bypass, so that half is covered by app-menu.test.ts, not here.
describe('browse zoom', () => {
  const percent = async (): Promise<number> => {
    const label = page.getByText(/^\d+%$/).first();
    return Number.parseInt((await label.innerText()).replace('%', ''), 10);
  };
  const click = (name: string): Promise<void> => page.getByLabel(name).first().click();
  let dpr = 1;

  it('steps through values on a wide window and never sticks between two values', async () => {
    await page.setViewportSize({ width: 2600, height: 900 });
    await go('/browse', 5000);
    dpr = await page.evaluate(() => window.devicePixelRatio);
    for (let i = 0; i < 25; i++) await click('Zoom in');
    expect(await percent()).toBe(200);
    const seen = new Set<number>();
    for (let i = 0; i < 6; i++) {
      const before = await percent();
      await click('Zoom out');
      const after = await percent();
      expect(after).toBeLessThan(before);
      seen.add(after);
    }
    expect(seen.size).toBe(6);
    await click('Zoom in');
    await shot('6-browse-wide-zoom');
  });

  it('Ctrl+wheel changes the app zoom', async () => {
    await click('Reset zoom');
    await page.mouse.move(1300, 500);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await page.waitForTimeout(300);
    expect(await percent()).toBe(110);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Control');
    await page.waitForTimeout(300);
    expect(await percent()).toBe(100);
  });

  it('Ctrl +, -, 0 and the numpad keys change the app zoom', async () => {
    await page.keyboard.press('Control+Equal');
    expect(await percent()).toBe(110);
    await page.keyboard.press('Control+NumpadAdd');
    expect(await percent()).toBe(120);
    await page.keyboard.press('Control+Minus');
    expect(await percent()).toBe(110);
    await page.keyboard.press('Control+NumpadSubtract');
    expect(await percent()).toBe(100);
    await page.keyboard.press('Control+Equal');
    await page.keyboard.press('Control+0');
    expect(await percent()).toBe(100);
  });

  it('leaves the page zoom alone', async () => {
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(dpr);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });
});

describe('keyboard scrolling (b-oss#668)', () => {
  const scrollTop = (): Promise<number> =>
    page.evaluate(async () => {
      const contents = [...document.querySelectorAll('ion-content')].filter(
        (c) => !c.closest('.ion-page-hidden'),
      ) as unknown as { getScrollElement(): Promise<HTMLElement> }[];
      const el = await contents[contents.length - 1].getScrollElement();
      return el.scrollTop;
    });
  const press = async (key: string): Promise<number> => {
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    return scrollTop();
  };

  it('Up/Down/PageUp/PageDown/Home/End scroll a long entry page with nothing focused', async () => {
    await go('/entry/5000000003', 4500);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await scrollTop()).toBe(0);
    const afterDown = await press('ArrowDown');
    expect(afterDown).toBeGreaterThan(0);
    const afterPage = await press('PageDown');
    expect(afterPage).toBeGreaterThan(afterDown);
    expect(await press('PageUp')).toBeLessThan(afterPage);
    expect(await press('End')).toBeGreaterThanOrEqual(afterPage);
    expect(await press('Home')).toBe(0);
    await press('ArrowDown');
    expect(await press('ArrowUp')).toBe(0);
  });

  it('Left/Right do not scroll the page', async () => {
    const before = await scrollTop();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    // Whether it navigates depends on the entry having neighbours; it must never scroll.
    expect(await scrollTop()).toBe(before);
  });
});

describe('a stale session (b-oss#678)', () => {
  const assets = join(__dirname, '..', '..', 'b-mobile', 'dist', 'assets');
  const chunk = (): string => {
    const name = readdirSync(assets).find((f) => /^MapScreen-.*\.js$/.test(f));
    if (!name) throw new Error('No MapScreen chunk in the build');
    return join(assets, name);
  };

  it('reloads once when a lazy chunk has vanished, then shows the error screen; a restored build works', async () => {
    const file = chunk();
    renameSync(file, `${file}.hidden`);
    try {
      let loads = 0;
      const count = (): void => {
        loads += 1;
      };
      page.on('load', count);
      await page.evaluate(() => sessionStorage.removeItem('bmpc-stale-chunk-reload'));
      await go('/map', 6000);
      page.off('load', count);
      // The navigation itself, plus exactly one automatic reload; no loop.
      expect(loads).toBe(2);
      expect(await text()).toMatch(/something went wrong|reload/i);
      await shot('6-stale-chunk');
    } finally {
      renameSync(`${file}.hidden`, file);
    }
    await page.evaluate(() => sessionStorage.removeItem('bmpc-stale-chunk-reload'));
    await go('/map', 4000);
    expect(await text()).not.toMatch(/something went wrong/i);
  });
});

// Destructive tests (they crash or reload the renderer) must stay LAST in this file: every test after them
// would run against a page that is gone.
describe('the page going away mid-IPC (disposed render frame)', () => {
  it('reloads under a storm of IPC calls without an unhandled rejection in the main process', async () => {
    const callers = page.evaluate(async () => {
      const bridge = window.bMobileDesktop;
      const calls: Promise<unknown>[] = [];
      for (let i = 0; i < 200; i++) {
        calls.push(Promise.resolve(bridge?.secure.get('k')).catch(() => undefined));
        calls.push(
          Promise.resolve(bridge?.notify.configure({ accounts: [] })).catch(() => undefined),
        );
      }
      location.reload();
      await Promise.allSettled(calls);
    });
    await callers.catch(() => undefined); // the page is torn down under it: expected
    // Notifications fire (counts keep rising) and clicks arrive while the page is being reloaded, so the
    // shell sends to the renderer exactly as its frame is replaced.
    for (let i = 0; i < 14; i++) {
      await setUnread(20 + i, 20 + i);
      await page.waitForTimeout(700);
      await fetch(`${NOTIFY}/click/0`, { method: 'POST' }).catch(() => undefined);
      await page.evaluate(() => location.reload()).catch(() => undefined);
    }
    await setUnread(0, 0);
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => window.bMobileDesktop?.version)).toBe(1);

    const logs = execFileSync('docker', ['logs', CONTAINER], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(logs).not.toMatch(/UnhandledPromiseRejection|unhandled rejection|disposed before/i);
  });

  it('survives the renderer crashing while notifications and clicks arrive', async () => {
    await page.goto('chrome://crash').catch(() => undefined);
    for (let i = 0; i < 6; i++) {
      await setUnread(60 + i, 60 + i);
      await fetch(`${NOTIFY}/click/0`, { method: 'POST' }).catch(() => undefined);
      await settle(1000);
    }
    await setUnread(0, 0);
    const logs = execFileSync('docker', ['logs', CONTAINER], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(logs).not.toMatch(/UnhandledPromiseRejection|unhandled rejection|disposed before/i);
  });
});
