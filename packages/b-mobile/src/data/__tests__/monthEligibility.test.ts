// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi } from 'vitest';
import { fetchMonthEligibility } from '../journal.js';

// Regression: journal/month nests its grid under `month` (`{ month: { days } }`). The client was
// typed flat, so this function read `days` off the wrong object and threw for every call — the
// compose screen's date picker could never load a month.
vi.mock('../client.js', () => ({
  getClient: () =>
    Promise.resolve({
      getJournalMonth: () =>
        Promise.resolve({
          month: {
            month: 10,
            year: 2026,
            week_start: 1,
            days: [
              null,
              {
                day: 1,
                month: 10,
                year: 2026,
                state: 1,
                entry: { entry_id_str: 'e1' },
                actions: { publish: 0 },
              },
              { day: 6, month: 10, year: 2026, state: 0, entry: null, actions: { publish: 1 } },
            ],
          },
        }),
    }),
}));

describe('fetchMonthEligibility', () => {
  it('keys each real day by YYYY-MM-DD and skips the null padding', async () => {
    const map = await fetchMonthEligibility('2026-10-01');
    expect(Object.keys(map).sort()).toEqual(['2026-10-01', '2026-10-06']);
  });
});
