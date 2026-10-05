// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shiftYear, fetchOwnEntryIdForDate, fetchHistoryItems } from '../journalDays.js';

// A plain stub rather than vi.fn(): Vitest's spy tracks the promise a mock returns, and for one that
// *rejects* that bookkeeping surfaces as an unhandled rejection even though the code under test
// handles it.
type DayResult = ReturnType<typeof day>;
let impl: (date: string) => Promise<DayResult> = () => Promise.reject(new Error('unset'));
const calls: string[] = [];
const getJournalDay = {
  mockImplementation(fn: (date: string) => Promise<DayResult>) {
    impl = fn;
  },
  mockResolvedValue(value: DayResult) {
    impl = () => Promise.resolve(value);
  },
  mockRejectedValue(err: Error) {
    impl = () => Promise.reject(err);
  },
};
vi.mock('../client.js', () => ({
  getClient: () =>
    Promise.resolve({
      getJournalDay: (d: string) => {
        calls.push(d);
        return impl(d);
      },
    }),
}));

function day(state: number, id: string | null, date = '2025-10-02') {
  return {
    day: {
      state,
      entry: id
        ? { entry_id_str: id, date, thumbnail_url: `thumb/${id}.jpg`, title: 't', username: 'u' }
        : null,
    },
  };
}

beforeEach(() => {
  calls.length = 0;
  impl = () => Promise.reject(new Error('unset'));
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

describe('fetchOwnEntryIdForDate', () => {
  it('returns the entry id when the day has an entry', async () => {
    getJournalDay.mockResolvedValue(day(1, 'e1'));
    expect(await fetchOwnEntryIdForDate('2025-10-02')).toBe('e1');
    expect(calls).toContain('2025-10-02');
  });

  it('returns null for an empty day (and any other non-entry state)', async () => {
    getJournalDay.mockResolvedValue(day(0, null));
    expect(await fetchOwnEntryIdForDate('2025-10-03')).toBeNull();
    getJournalDay.mockResolvedValue(day(3, null)); // future
    expect(await fetchOwnEntryIdForDate('2099-01-01')).toBeNull();
  });
});

describe('fetchHistoryItems', () => {
  it('asks for exactly one year before and after, and labels them', async () => {
    getJournalDay.mockImplementation((d: string) =>
      Promise.resolve(day(1, d === '2025-10-02' ? 'ago' : 'ahead', d)),
    );
    const items = await fetchHistoryItems('2026-10-02');
    expect(calls).toEqual(expect.arrayContaining(['2025-10-02', '2027-10-02']));
    expect(items).toEqual([
      { label: '1 year ago', entryId: 'ago', date: '2025-10-02', thumbnailPath: 'thumb/ago.jpg' },
      {
        label: '1 year ahead',
        entryId: 'ahead',
        date: '2027-10-02',
        thumbnailPath: 'thumb/ahead.jpg',
      },
    ]);
  });

  it('omits a side with no entry (empty, or in the future)', async () => {
    getJournalDay.mockImplementation((d: string) =>
      Promise.resolve(d === '2025-10-02' ? day(1, 'ago', d) : day(3, null)),
    );
    const items = await fetchHistoryItems('2026-10-02');
    expect(items.map((i) => i.entryId)).toEqual(['ago']);
  });

  it('returns an empty list when neither side has an entry', async () => {
    getJournalDay.mockResolvedValue(day(0, null));
    expect(await fetchHistoryItems('2026-10-02')).toEqual([]);
  });

  it('still shows one side if the other lookup fails', async () => {
    getJournalDay.mockImplementation((d: string) =>
      d === '2025-10-02' ? Promise.resolve(day(1, 'ago', d)) : Promise.reject(new Error('rate')),
    );
    const items = await fetchHistoryItems('2026-10-02');
    expect(items.map((i) => i.entryId)).toEqual(['ago']);
  });

  it('rejects only when every lookup failed', async () => {
    getJournalDay.mockRejectedValue(new Error('offline'));
    await expect(fetchHistoryItems('2026-10-02')).rejects.toThrow('offline');
  });
});
