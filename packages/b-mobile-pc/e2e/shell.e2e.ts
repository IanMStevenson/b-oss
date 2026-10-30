// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// End-to-end tests for the real shell. e2e/run.sh starts Electron in Docker (CDP port from BMPC_CDP, default :9222) with
// b-mobile's stub API behind the proxy and a fake sign-in server; these tests drive its window with
// Playwright over CDP. The tests share one window and run in order: the later ones build on the
// signed-in state the sign-in test leaves.

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CDP = process.env.BMPC_CDP ?? 'http://127.0.0.1:9222';
const OUT = process.env.BMPC_E2E_OUT ?? join(__dirname, '..', 'e2e-out');
const USER_DATA = process.env.BMPC_E2E_USER_DATA;

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

  it('denies browser permission prompts', async () => {
    const result = await page.evaluate(
      () =>
        new Promise<string>((resolve) =>
          navigator.geolocation.getCurrentPosition(
            () => resolve('granted'),
            (e) => resolve(`denied:${e.code}`),
          ),
        ),
    );
    expect(result).toBe('denied:1');
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
const STUB = process.env.BMPC_STUB ?? 'http://127.0.0.1:5192';
const NOTIFY = process.env.BMPC_NOTIFY ?? 'http://127.0.0.1:5194';

interface Shown {
  title: string;
  body: string;
  count: number;
  payload: { kind: string; stream?: string; accountId: string };
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

  it('a click routes to the right screen', async () => {
    await go('/browse', 2500);
    const list = await shown();
    const index = list.findIndex((n) => n.payload.stream === 'notifications');
    expect((await fetch(`${NOTIFY}/click/${index}`, { method: 'POST' })).status).toBe(200);
    await page.waitForFunction(() => location.pathname === '/notifications', undefined, {
      timeout: 10_000,
    });
    const last = list.length - 1;
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
    const reauth = after.slice(before).filter((n) => n.payload.kind === 'reauth-required');
    expect(reauth).toHaveLength(1);
    expect(reauth[0]?.body).toMatch(/Sign in again/);
    await settle(); // polling that account has stopped: still just the one
    expect((await shown()).filter((n) => n.payload.kind === 'reauth-required')).toHaveLength(1);
    await fetch(`${STUB}/__token-dead?on=0`);

    const index = after.findIndex((n) => n.payload.kind === 'reauth-required');
    await fetch(`${NOTIFY}/click/${index}`, { method: 'POST' });
    await page.waitForFunction(() => location.pathname === '/accounts', undefined, {
      timeout: 10_000,
    });
    expect(page.url()).toContain('reauth=cyclopstest');
    await shot('5-reauth');
  });
});
