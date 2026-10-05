// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Date-based lookups for the entry page's calendar and history pop-down (b-oss#169). They use
// journal/day, which is user-auth only and takes no username — so it can only ever answer for the
// *signed-in user's own* journal. Callers must only offer these for the user's own entries.

import { getClient } from './client.js';
import type { HistoryItem } from '@b-oss/b-view';

/** `date` (YYYY-MM-DD) moved by whole `years`. 29 Feb in a non-leap target year becomes 28 Feb
 * rather than rolling over into March. */
export function shiftYear(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const year = y + years;
  const lastDay = new Date(year, m, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The id of the user's own entry on `date`, or `null` if there isn't one. */
export async function fetchOwnEntryIdForDate(date: string): Promise<string | null> {
  const client = await getClient();
  const { day } = await client.getJournalDay(date);
  return day.state === 1 && day.entry ? day.entry.entry_id_str : null;
}

/** The user's own entries exactly one year before and after `date`, where they exist. Rejects
 * only if *every* lookup failed — one failing side still shows the other. */
export async function fetchHistoryItems(date: string): Promise<HistoryItem[]> {
  const client = await getClient();
  const targets = [
    { label: '1 year ago', date: shiftYear(date, -1) },
    { label: '1 year ahead', date: shiftYear(date, 1) },
  ];
  const results = await Promise.allSettled(targets.map((t) => client.getJournalDay(t.date)));
  if (results.every((r) => r.status === 'rejected')) {
    throw results[0].status === 'rejected' ? results[0].reason : new Error('History failed');
  }
  const items: HistoryItem[] = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const { day } = r.value;
    if (day.state !== 1 || !day.entry) return;
    items.push({
      label: targets[i].label,
      entryId: day.entry.entry_id_str,
      date: day.entry.date,
      thumbnailPath: day.entry.thumbnail_url,
    });
  });
  return items;
}
