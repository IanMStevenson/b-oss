// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { agoText, inText, isProblem, statusLine } from '../notifyStatusText.js';
import type { DesktopAccountStatus } from '../../platform/desktopNotify.js';

const MIN = 60_000;
const base: DesktopAccountStatus = {
  accountId: 'ann',
  lastCheckedAt: null,
  nextCheckAt: null,
  checking: false,
  result: null,
};

describe('relative times', () => {
  it.each([
    [0, 'just now'],
    [44_000, 'just now'],
    [60_000, 'a minute ago'],
    [2 * MIN, '2 minutes ago'],
    [59 * MIN, '59 minutes ago'],
    [120 * MIN, '2 hours ago'],
  ])('ago %d -> %s', (ms, text) => expect(agoText(ms)).toBe(text));

  it.each([
    [-5, 'any moment now'],
    [10_000, 'in less than a minute'],
    [MIN, 'in about 1 minute'],
    [3 * MIN, 'in about 3 minutes'],
  ])('in %d -> %s', (ms, text) => expect(inText(ms)).toBe(text));
});

describe('statusLine', () => {
  const now = 10_000_000;

  it('says so when nothing is known', () => {
    expect(statusLine(null, now)).toBe('Not checked yet');
    expect(statusLine(base, now)).toBe('Not checked yet');
  });

  it('shows last checked, next check and the result', () => {
    expect(
      statusLine(
        {
          ...base,
          lastCheckedAt: now - 2 * MIN,
          nextCheckAt: now + 3 * MIN,
          result: { kind: 'ok', text: 'Nothing new', newItems: 0 },
        },
        now,
      ),
    ).toBe('Checked 2 minutes ago · next check in about 3 minutes · Nothing new');
  });

  it('shows an error result and drops "next" when none is due', () => {
    const status: DesktopAccountStatus = {
      ...base,
      lastCheckedAt: now - MIN,
      result: {
        kind: 'sign-in-needed',
        text: 'Sign-in needed: Blipfoto rejected the saved sign-in',
      },
    };
    expect(statusLine(status, now)).toBe(
      'Checked a minute ago · Sign-in needed: Blipfoto rejected the saved sign-in',
    );
    expect(isProblem(status)).toBe(true);
  });

  it('shows a check in progress', () => {
    expect(statusLine({ ...base, checking: true }, now)).toBe('Checking now…');
  });

  it('does not treat ok or the baseline as a problem', () => {
    expect(isProblem({ ...base, result: { kind: 'ok', text: 'Nothing new' } })).toBe(false);
    expect(isProblem({ ...base, result: { kind: 'baseline', text: 'x' } })).toBe(false);
    expect(isProblem(null)).toBe(false);
  });
});
