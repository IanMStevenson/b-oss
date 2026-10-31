// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Survey for b-oss#676: which text-bearing elements sit under a layer-promoting ancestor or at fractional
// positions, in the real app, via CDP. Runs only when the shell was
// started with BMPC_CSS_EXPERIMENT=report:
//   BMPC_CSS_EXPERIMENT=report npm run e2e -w @b-oss/b-mobile-pc -- blur-survey
// Writes blur-survey-<view>.json and .png to e2e-out/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { join } from 'node:path';

const CDP = process.env.BMPC_CDP ?? 'http://127.0.0.1:9222';
const OUT = process.env.BMPC_E2E_OUT ?? join(__dirname, '..', 'e2e-out');
const active = process.env.BMPC_CSS_EXPERIMENT === 'report';
let browser: Browser;
let page: Page;

beforeAll(async () => {
  if (!active) return;
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  if (!context) throw new Error('no context');
  page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForTimeout(4000);
});
afterAll(async () => {
  await browser?.close();
});

const SURVEY = `(() => {
  const frac = (n) => Math.abs(n - Math.round(n)) > 0.01;
  const up = (n) => n.parentElement || (n.getRootNode() && n.getRootNode().host) || null;
  const reasonsOf = (el) => {
    const cs = getComputedStyle(el); const r = [];
    if (cs.transform !== 'none') r.push('transform');
    if (cs.willChange !== 'auto') r.push('will-change:' + cs.willChange);
    if (cs.filter !== 'none') r.push('filter');
    if (cs.backdropFilter && cs.backdropFilter !== 'none') r.push('backdrop-filter');
    if (cs.opacity !== '1') r.push('opacity:' + cs.opacity);
    if (cs.position === 'fixed') r.push('fixed');
    if (cs.position === 'sticky') r.push('sticky');
    if (cs.mixBlendMode !== 'normal') r.push('blend');
    if (cs.isolation === 'isolate') r.push('isolation');
    if (cs.translate !== 'none' && cs.translate !== '') r.push('translate:' + cs.translate);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) r.push('scroller');
    return r;
  };
  const name = (el) => el.localName + (el.id ? '#' + el.id : '') + (el.classList && el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
  const out = [];
  const visit = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      const txt = t.nodeValue.trim(); if (!txt) continue;
      const el = t.parentElement; if (!el) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      const rc = rg.getBoundingClientRect(); if (rc.width === 0) continue;
      const chain = []; let n = el; let guard = 0;
      while (n && guard++ < 40) { const rs = reasonsOf(n); if (rs.length) chain.push(name(n) + '[' + rs.join(',') + ']'); n = up(n); }
      const cs = getComputedStyle(el);
      out.push({ text: txt.slice(0, 24), el: name(el), promoted: chain, textRect: [rc.left, rc.top].map((v) => +v.toFixed(2)), fractional: frac(rc.left) || frac(rc.top), fontSize: cs.fontSize, color: cs.color, inShadow: el.getRootNode() !== document });
    }
  };
  const walkAll = (root) => { visit(root); root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walkAll(e.shadowRoot); }); };
  walkAll(document);
  return JSON.stringify(out);
})()`;

interface Row {
  text: string;
  el: string;
  promoted: string[];
  textRect: number[];
  fractional: boolean;
  inShadow: boolean;
}

async function survey(view: string): Promise<void> {
  const rows = JSON.parse(await page.evaluate<string>(SURVEY)) as Row[];
  writeFileSync(join(OUT, `blur-survey-${view}.json`), JSON.stringify({ text: rows }, null, 2));
  await page.screenshot({ path: join(OUT, `blur-survey-${view}.png`) });
  const promoted = rows.filter((r) => r.promoted.length);
  console.log(
    `[survey ${view}] text nodes ${rows.length}, under a promoting ancestor ${promoted.length}, fractional ${rows.filter((r) => r.fractional).length}`,
  );
}

describe.skipIf(!active)('blur survey (b-oss#676)', () => {
  it('surveys the page, then with the menu open', async () => {
    await survey('browse');
    await page
      .locator('ion-menu-button')
      .first()
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await page.waitForTimeout(1200);
    await survey('menu-open');
  });
});
