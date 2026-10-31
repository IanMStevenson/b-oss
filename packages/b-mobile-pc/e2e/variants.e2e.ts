// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shells started in a deliberately wrong way (run.sh, `start_variant`), each with its own window, user
// data and DevTools port, so a failure here cannot disturb the main run in shell.e2e.ts.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';

const OUT = process.env.BMPC_E2E_OUT ?? join(__dirname, '..', 'e2e-out');
const browsers: Browser[] = [];

async function connect(cdp: string | undefined): Promise<Page> {
  expect(cdp, 'run through e2e/run.sh').toBeTruthy();
  const browser = await chromium.connectOverCDP(cdp as string);
  browsers.push(browser);
  const context = browser.contexts()[0];
  if (!context) throw new Error('The shell has no browser context');
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForLoadState('load');
  return page;
}

const readLog = (userData: string | undefined): string => {
  const file = join(userData ?? join(OUT, 'no-user-data'), 'logs', 'app.log');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
};

afterAll(async () => {
  await Promise.all(browsers.map((b) => b.close()));
});

describe('a shell older than its web files (b-oss#696)', () => {
  it('says so, names both builds, and logs it', async () => {
    mkdirSync(OUT, { recursive: true });
    const page = await connect(process.env.BMPC_CDP_MISMATCH);
    const reported = await page.evaluate(
      async () => (await window.bMobileDesktop?.shell.info())?.build ?? 'none',
    );
    expect(reported).toBe('e2e-older-shell');

    await page.waitForSelector('[role="alert"]', { timeout: 20_000 });
    const notice = await page.locator('[role="alert"]').first().innerText();
    expect(notice).toContain('older program files');
    expect(notice).toContain('e2e-older-shell');
    expect(notice).toContain('Quit b-mobile completely');
    await page.screenshot({ path: join(OUT, 'mismatch-notice.png') });

    // The app still works underneath the notice (non-fatal).
    expect(await page.evaluate(() => document.body.innerText)).not.toContain(
      'Something went wrong',
    );

    await page.waitForTimeout(500);
    const log = readLog(process.env.BMPC_UD_MISMATCH);
    expect(log).toContain('"source":"shell-build"');
    expect(log).toContain('does not match web build');
    expect(log).toContain('e2e-older-shell');
    // The shell's own start line carries its build too.
    expect(log).toContain('build=e2e-older-shell');

    // Dismissing hides it.
    await page.getByRole('button', { name: 'Dismiss' }).click();
    expect(await page.locator('[role="alert"]').count()).toBe(0);

    // Help & about shows both versions.
    await page.evaluate(() => location.assign('/help'));
    await page.waitForFunction(
      () => document.body.innerText.includes('Desktop program version'),
      undefined,
      {
        timeout: 15_000,
      },
    );
    expect(await page.evaluate(() => document.body.innerText)).toContain(
      'e2e-older-shell (differs)',
    );
  });
});
