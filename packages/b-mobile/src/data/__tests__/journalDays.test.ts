// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shiftYear,
  fetchMonthDays,
  fetchCalendarMonth,
  fetchHistoryItems,
} from '../journalDays.js';

// The shape below is the *real* journal/month response (captured live 2026-10-05): the grid is
// nested under `month`, with `null` padding before the 1st, state 1 = has an entry, 3 = future.
type Months = Record<string, Record<number, string>>; // 'YYYY-MM' → day → entry id
let months: Months = {};
let failFor = new Set<string>();
const calls: Array<{ date: string; username?: string; weekStart?: number }> = [];

function monthResponse(year: number, month: number) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const entries = months[key] ?? {};
  const lastDay = new Date(year, month, 0).getDate();
  const days: unknown[] = [null, null]; // leading padding
  for (let d = 1; d <= lastDay; d++) {
    const id = entries[d];
    days.push({
      object: 'Day',
      day: d,
      month,
      year,
      state: id ? 1 : 3,
      entry: id
        ? {
            entry_id_str: id,
            date: `${key}-${String(d).padStart(2, '0')}`,
            thumbnail_url: `https://cdn.example/${id}.jpg`,
          }
        : null,
      actions: { publish: 0 },
    });
  }
  return { month: { month, year, week_start: 1, days } };
}

vi.mock('../client.js', () => ({
  getClient: () =>
    Promise.resolve({
      // A plain function, not vi.fn(): Vitest's spy tracks the promise a mock returns, and for a
      // rejecting one that surfaces as an unhandled rejection even though the code handles it.
      getJournalMonth: (date: string, opts?: { username?: string; weekStart?: number }) => {
        calls.push({ date, ...opts });
        const key = date.slice(0, 7);
        if (failFor.has(key)) return Promise.reject(new Error('offline'));
        const [y, m] = key.split('-').map(Number) as [number, number];
        return Promise.resolve(monthResponse(y, m));
      },
    }),
}));

beforeEach(() => {
  months = {};
  failFor = new Set();
  calls.length = 0;
});

describe('shiftYear', () => {
  it('moves a date by whole years', () => {
    expect(shiftYear('2026-10-02', -1)).toBe('2025-10-02');
    expect(shiftYear('2026-10-02', 1)).toBe('2027-10-02');
  });

  it('turns 29 Feb into 28 Feb in a non-leap target year, rather than rolling into March', () => {
    expect(shiftYear('2024-02-29', 1)).toBe('2025-02-28');
    expect(shiftYear('2024-02-29', -1)).toBe('2023-02-28');
    expect(shiftYear('2024-02-29', 4)).toBe('2028-02-29');
  });
});

describe('fetchMonthDays', () => {
  it('asks for that user and month, Monday-first, and reads the nested grid', async () => {
    months['2026-10'] = { 1: 'a', 3: 'c' };
    const days = await fetchMonthDays('flumgummery', 2026, 10);
    expect(calls).toEqual([{ date: '2026-10-01', username: 'flumgummery', weekStart: 1 }]);
    expect([...days.keys()]).toEqual([1, 3]);
    expect(days.get(3)).toEqual({
      entryId: 'c',
      date: '2026-10-03',
      thumbnailPath: 'https://cdn.example/c.jpg',
    });
  });

  it('ignores padding cells and days with no entry (future / empty)', async () => {
    months['2026-10'] = {};
    expect((await fetchMonthDays('u', 2026, 10)).size).toBe(0);
  });
});

describe('fetchCalendarMonth', () => {
  it('returns day-of-month → entry id for the days that have an entry', async () => {
    months['2026-09'] = { 2: 'x', 30: 'y' };
    expect(await fetchCalendarMonth('u', 2026, 9)).toEqual({ 2: 'x', 30: 'y' });
  });

  it('propagates a failed lookup so the calendar can show its retry state', async () => {
    failFor.add('2026-09');
    await expect(fetchCalendarMonth('u', 2026, 9)).rejects.toThrow('offline');
  });
});

describe('fetchHistoryItems', () => {
  it('reads one year before and after from their months, labelled, for the given user', async () => {
    months['2025-10'] = { 2: 'ago' };
    months['2027-10'] = { 2: 'ahead' };
    const items = await fetchHistoryItems('someone', '2026-10-02');
    expect(calls.map((c) => c.username)).toEqual(['someone', 'someone']);
    expect(items).toEqual([
      {
        label: '1 year ago',
        entryId: 'ago',
        date: '2025-10-02',
        thumbnailPath: 'https://cdn.example/ago.jpg',
      },
      {
        label: '1 year ahead',
        entryId: 'ahead',
        date: '2027-10-02',
        thumbnailPath: 'https://cdn.example/ahead.jpg',
      },
    ]);
  });

  it('omits a side with no entry on that exact day', async () => {
    months['2025-10'] = { 2: 'ago' };
    months['2027-10'] = { 9: 'other-day' }; // an entry that month, but not on the 2nd
    const items = await fetchHistoryItems('u', '2026-10-02');
    expect(items.map((i) => i.entryId)).toEqual(['ago']);
  });

  it('returns an empty list when neither side has one', async () => {
    expect(await fetchHistoryItems('u', '2026-10-02')).toEqual([]);
  });

  it('still shows one side if the other lookup fails', async () => {
    months['2025-10'] = { 2: 'ago' };
    failFor.add('2027-10');
    const items = await fetchHistoryItems('u', '2026-10-02');
    expect(items.map((i) => i.entryId)).toEqual(['ago']);
  });

  it('rejects only when every lookup failed', async () => {
    failFor.add('2025-10');
    failFor.add('2027-10');
    await expect(fetchHistoryItems('u', '2026-10-02')).rejects.toThrow('offline');
  });

  it('handles 29 Feb (the shifted day is 28 Feb in a non-leap year)', async () => {
    months['2023-02'] = { 28: 'prev' };
    const items = await fetchHistoryItems('u', '2024-02-29');
    expect(items.map((i) => i.entryId)).toEqual(['prev']);
  });
});
