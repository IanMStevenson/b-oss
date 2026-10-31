// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
  CSS_EXPERIMENTS,
  PLAIN_PAGE_CSP,
  cssFor,
  parseCssExperiments,
  parseTestPage,
  plainTestPage,
} from '../blur-bisect.js';

describe('blur bisect switches (b-oss#676)', () => {
  it('are inert when unset or unknown', () => {
    expect(parseTestPage(undefined)).toBeNull();
    expect(parseTestPage('other')).toBeNull();
    expect(parseCssExperiments(undefined)).toEqual({ experiments: [], unknown: [] });
    expect(cssFor([])).toBe('');
  });

  it('parses names, reports unknown ones, expands all', () => {
    expect(parseTestPage(' plain ')).toBe('plain');
    const r = parseCssExperiments('no-layers, bogus,report');
    expect(r.experiments).toEqual(['report', 'no-layers']);
    expect(r.unknown).toEqual(['bogus']);
    expect(parseCssExperiments('all').experiments).toEqual([...CSS_EXPERIMENTS]);
  });

  it('gives every CSS experiment some CSS, and report none', () => {
    for (const e of CSS_EXPERIMENTS) {
      if (e === 'report' || e === 'all') continue;
      expect(cssFor([e]), e).toContain('!important');
    }
    expect(cssFor(['report'])).toBe('');
  });

  it('plain page has 16 samples plus 4 on green, no script, and a CSP that allows no script', () => {
    const html = plainTestPage();
    expect(html.match(/class="s"/g)?.length).toBe(20);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('Segoe UI');
    expect(html).not.toMatch(/style="[^"]*"[^>]*"[^>]*>/); // stacks use single quotes inside style=""
    expect(html.match(/style="font:[^"]*"/g)?.length).toBe(20);
    expect(PLAIN_PAGE_CSP).not.toContain('script-src');
    expect(PLAIN_PAGE_CSP).toContain("default-src 'none'");
  });
});
