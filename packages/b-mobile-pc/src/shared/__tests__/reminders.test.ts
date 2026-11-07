// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { parseReminderAccountId, parseReminderConfigs, parseReminderTime } from '../reminders.js';

describe('reminder parsing (the renderer is untrusted)', () => {
  it('accepts a valid time and rejects anything else', () => {
    expect(parseReminderTime({ hour: 20, minute: 15 })).toEqual({ hour: 20, minute: 15 });
    const bad = [
      null,
      'x',
      {},
      { hour: 24, minute: 0 },
      { hour: 1, minute: 60 },
      { hour: 1.5, minute: 0 },
      { hour: '1', minute: 0 },
    ];
    for (const b of bad) expect(() => parseReminderTime(b)).toThrow();
  });

  it('accepts a sane account id and rejects empty, non-string and huge ones', () => {
    expect(parseReminderAccountId('ian')).toBe('ian');
    for (const b of ['', 5, null, 'x'.repeat(129)]) {
      expect(() => parseReminderAccountId(b)).toThrow();
    }
  });

  it('parses a set, keeping the first of a duplicate account', () => {
    expect(
      parseReminderConfigs([
        { accountId: 'a', hour: 1, minute: 2 },
        { accountId: 'a', hour: 3, minute: 4 },
      ]),
    ).toEqual([{ accountId: 'a', time: { hour: 1, minute: 2 } }]);
    expect(() => parseReminderConfigs('nope')).toThrow();
    expect(() =>
      parseReminderConfigs(new Array(33).fill({ accountId: 'a', hour: 1, minute: 2 })),
    ).toThrow();
  });
});
