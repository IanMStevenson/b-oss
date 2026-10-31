// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The blur bisect switches (b-oss#676). Skipped unless BMPC_TEST_PAGE or BMPC_CSS_EXPERIMENT is set for the run,
// because it needs the shell started with them (run.sh passes both to the container) and the main suite
// must not be run with them. Run only this file:
//   BMPC_CSS_EXPERIMENT=all npm run e2e -w @b-oss/b-mobile-pc -- blur-bisect
//   BMPC_TEST_PAGE=plain    npm run e2e -w @b-oss/b-mobile-pc -- blur-bisect
// Writes e2e-out/blur-*.png and blur-report.json (layer-promoted / fractionally placed elements).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { REPORT_SCRIPT, parseCssExperiments } from '../src/main/blur-bisect.js';

const CDP = process.env.BMPC_CDP ?? 'http://127.0.0.1:9222';
const OUT = process.env.BMPC_E2E_OUT ?? join(__dirname, '..', 'e2e-out');
const USER_DATA = process.env.BMPC_E2E_USER_DATA;
const PLAIN = process.env.BMPC_TEST_PAGE === 'plain';
const { experiments } = parseCssExperiments(process.env.BMPC_CSS_EXPERIMENT);
const active = PLAIN || experiments.length > 0;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  if (!active) return;
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  if (!context) throw new Error('The shell has no browser context');
  page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForLoadState('load');
  await page.waitForTimeout(4000);
});
afterAll(async () => {
  await browser?.close();
});

const log = (): string =>
  USER_DATA ? readFileSync(join(USER_DATA, 'logs', 'app.log'), 'utf8') : '';

describe.skipIf(!active)('blur bisect switches (b-oss#676)', () => {
  it('logs the active switches in the app log', () => {
    if (!USER_DATA) return;
    expect(log()).toContain('blur bisect active:');
  });

  it.skipIf(!PLAIN)('BMPC_TEST_PAGE=plain serves a plain text page on the app origin', async () => {
    expect(page.url()).toMatch(/^app:\/\/b-mobile\//);
    expect(await page.title()).toBe('b-mobile plain text test');
    expect(await page.locator('.s').count()).toBe(20);
    expect(await page.locator('ion-app').count()).toBe(0);
    await page.screenshot({ path: join(OUT, 'blur-plain.png') });
  });

  it.skipIf(PLAIN)('BMPC_CSS_EXPERIMENT injects CSS and logs the layer report', async () => {
    const css = experiments.filter((e) => e !== 'report' && e !== 'all');
    if (css.length) {
      // insertCSS adds a style sheet outside document.styleSheets only in some versions; check an effect.
      const probe = await page.evaluate(() => {
        const t = document.querySelector('ion-title');
        return {
          font: getComputedStyle(document.body).fontFamily,
          trans: getComputedStyle(document.body).transitionDuration,
          anim: getComputedStyle(document.body).animationName,
          titleAlign: t ? getComputedStyle(t).textAlign : null,
        };
      });
      if (experiments.includes('system-font')) expect(probe.font).toContain('Segoe UI');
      if (experiments.includes('no-ionic-transitions')) expect(probe.trans).toBe('0s');
      if (experiments.includes('no-title-centering') && probe.titleAlign)
        expect(['start', 'left']).toContain(probe.titleAlign);
    }
    const report = JSON.parse(await page.evaluate<string>(REPORT_SCRIPT)) as {
      elements: Array<{ el: string }>;
    };
    expect(report.elements.length).toBeGreaterThan(0);
    writeFileSync(join(OUT, 'blur-report.json'), JSON.stringify(report, null, 2));
    await page.screenshot({ path: join(OUT, 'blur-experiment.png') });
    if (USER_DATA) await expect.poll(log, { timeout: 8000 }).toContain('css experiment report:');
  });
});
