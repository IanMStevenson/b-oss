// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// End-to-end tests for the real shell. e2e/run.sh starts Electron in Docker (CDP on :9222) with
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
