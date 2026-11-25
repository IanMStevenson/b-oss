// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The host contract for the member's website session (b-oss#1050, b-oss#1053), tested against the
// real shell and a stand-in for the site (e2e/fake-site.mjs; the shell's BMPC_SITE_ORIGIN hook points
// its hidden page runs there). The calls go through the preload bridge exactly as the app makes them,
// so what is tested is the shell's `site` host and the page scripts together: per-account isolation,
// the member guard, reading, adding and removing extras, a protected journal, sign-out.
//
// The file name sorts before shell.e2e.ts on purpose: the files share one shell and run in name
// order, and the shell suite ends with the window closed, which this one needs open.

import {
  buildAddExtrasScript,
  buildPageHtmlScript,
  buildReadBackScript,
  buildRemainingScript,
  buildWhoAmIScript,
} from '@b-oss/b-api-web';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CDP = process.env.BMPC_CDP ?? 'http://127.0.0.1:9222';
const SITE = process.env.BMPC_SITE ?? 'http://127.0.0.1:5195';

// The pages are named by the real address, as the app names them; the shell swaps in the fake origin.
const REAL = 'https://www.blipfoto.com';
const A = 'acct-a';
const B = 'acct-b';
// A 1x1 JPEG as base64: what the add script hands the page's uploader.
const JPEG =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

let browser: Browser;
let page: Page;

interface Run {
  accountId: string;
  url: string;
  script: string;
  timeoutMs: number;
  waitForNavigation: boolean;
}

/** One run through the bridge; the script's answer parsed, or the error text if the host refused. */
async function run(
  accountId: string,
  path: string,
  script: string,
  wait = false,
): Promise<Record<string, unknown>> {
  const request: Run = {
    accountId,
    url: `${REAL}${path}`,
    script,
    timeoutMs: 30_000,
    waitForNavigation: wait,
  };
  try {
    const { result } = await page.evaluate((r) => window.bMobileDesktop!.site.runPage(r), request);
    return result === null
      ? { refused: 'no result' }
      : (JSON.parse(result) as Record<string, unknown>);
  } catch (err) {
    return { refused: String(err) };
  }
}

const state = async (): Promise<
  Record<string, { entries: Record<string, { extras: { id: string }[] }> }>
> => (await (await fetch(`${SITE}/test/state`)).json()) as never;

beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  if (!context) throw new Error('The shell has no browser context');
  page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForLoadState('load');
  await fetch(`${SITE}/test/reset`);
});

afterAll(async () => {
  await browser?.close();
});

describe('the host contract: refusing what it must refuse', () => {
  it('loads only pages on the site, whatever the app asks', async () => {
    const bad = await run(A, '', buildWhoAmIScript());
    expect(bad).not.toHaveProperty('refused'); // the site itself is fine (no path)
    const other = await page.evaluate(
      (r) =>
        window.bMobileDesktop!.site.runPage(r).then(
          () => 'loaded',
          (e: unknown) => String(e),
        ),
      {
        accountId: A,
        url: 'https://evil.example/',
        script: '1',
        timeoutMs: 5000,
        waitForNavigation: false,
      },
    );
    expect(other).toMatch(/Only pages on the Blipfoto website/);
  });

  it('needs an account for every call', async () => {
    const result = await page.evaluate(
      (r) =>
        window.bMobileDesktop!.site.runPage(r).then(
          () => 'ran',
          (e: unknown) => String(e),
        ),
      {
        accountId: '',
        url: `${REAL}/browse`,
        script: '1',
        timeoutMs: 5000,
        waitForNavigation: false,
      },
    );
    expect(result).toMatch(/account/i);
  });
});

describe('one session per account', () => {
  it('starts with no session for either account', async () => {
    expect(await run(A, '/settings/general', buildWhoAmIScript())).toEqual({
      status: 'needs-login',
    });
    expect(await run(B, '/settings/general', buildWhoAmIScript())).toEqual({
      status: 'needs-login',
    });
  });

  it('keeps each account signed in as its own member, and never the other', async () => {
    expect(await run(A, '/test/login?as=cyclopstest', buildWhoAmIScript())).toEqual({
      status: 'ok',
      user: 'cyclopstest',
    });
    // B has still no session: A's sign-in did not leak into it.
    expect(await run(B, '/settings/general', buildWhoAmIScript())).toEqual({
      status: 'needs-login',
    });
    expect(await run(B, '/test/login?as=cyclops', buildWhoAmIScript())).toEqual({
      status: 'ok',
      user: 'cyclops',
    });
    expect(await run(A, '/settings/general', buildWhoAmIScript())).toEqual({
      status: 'ok',
      user: 'cyclopstest',
    });
  });
});

describe('the member guard', () => {
  it('refuses any page not signed in as the member the app is acting for', async () => {
    const edit = '/entry/100/edit';
    expect(await run(A, edit, buildReadBackScript('cyclops'))).toEqual({
      status: 'wrong-account',
      user: 'cyclopstest',
    });
    expect(await run(B, edit, buildReadBackScript('cyclopstest'))).toEqual({
      status: 'wrong-account',
      user: 'cyclops',
    });
    expect(await run(A, '/entry/100', buildPageHtmlScript('cyclops'))).toEqual({
      status: 'wrong-account',
      user: 'cyclopstest',
    });
    expect(await run(A, '/publish', buildRemainingScript('cyclops'))).toEqual({
      status: 'wrong-account',
      user: 'cyclopstest',
    });
  });

  it('acts as the member, case aside, when the page says exactly that member', async () => {
    const read = await run(A, '/entry/100/edit', buildReadBackScript('CyclopsTest'));
    expect(read.status).toBe('ok');
    expect((read.items as unknown[]).length).toBe(2);
    expect(read.remaining).toBe(98);
  });
});

describe('extras: add, remove, read back', () => {
  it('adds an extra through the page and its own Save, then sees it', async () => {
    const sent = await run(
      A,
      '/entry/100/edit',
      buildAddExtrasScript('cyclopstest', [
        { name: 'e.jpg', mimeType: 'image/jpeg', base64: JPEG },
      ]),
      true,
    );
    expect(sent.status).toBe('submitted');
    const after = await run(A, '/entry/100/edit', buildReadBackScript('cyclopstest'));
    expect(after.status).toBe('ok');
    expect((after.items as unknown[]).length).toBe(3);
    expect(after.remaining).toBe(97);
    expect((await state()).cyclopstest?.entries['100']?.extras).toHaveLength(3);
  });

  it('removes an extra by its id through the page and its own Save', async () => {
    const sent = await run(
      A,
      '/entry/100/edit',
      buildAddExtrasScript('cyclopstest', [], ['x1']),
      true,
    );
    expect(sent.status).toBe('submitted');
    expect(sent.missing).toEqual([]);
    const extras = (await state()).cyclopstest?.entries['100']?.extras.map((x) => x.id) ?? [];
    expect(extras).not.toContain('x1');
    expect(extras).toContain('x2');
  });

  it('refuses to add or remove for another member, and changes nothing', async () => {
    const before = JSON.stringify(await state());
    const sent = await run(
      B,
      '/entry/100/edit',
      buildAddExtrasScript('cyclopstest', [
        { name: 'e.jpg', mimeType: 'image/jpeg', base64: JPEG },
      ]),
      true,
    );
    expect(sent).toEqual({ status: 'wrong-account', user: 'cyclops' });
    expect(JSON.stringify(await state())).toBe(before);
  });
});

describe('a protected journal', () => {
  it('shows another member only the notice, and the owner the gallery', async () => {
    const other = await run(B, '/entry/100', buildPageHtmlScript('cyclops'));
    expect(other.status).toBe('ok');
    expect(String(other.html)).toContain('entries are protected');
    expect(String(other.html)).not.toContain('blipfoto.data.gallery');
    const own = await run(A, '/entry/100', buildPageHtmlScript('cyclopstest'));
    expect(own.status).toBe('ok');
    expect(String(own.html)).toContain('blipfoto.data.gallery');
  });
});

describe('signing out', () => {
  it('deletes that account session only', async () => {
    await page.evaluate((id) => window.bMobileDesktop!.site.signOut(id), A);
    expect(await run(A, '/settings/general', buildWhoAmIScript())).toEqual({
      status: 'needs-login',
    });
    expect(await run(B, '/settings/general', buildWhoAmIScript())).toEqual({
      status: 'ok',
      user: 'cyclops',
    });
  });
});
