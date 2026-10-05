// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Date-based lookups for the entry page's calendar and history pop-down (b-oss#169), both built on
// journal/month — one call per month, for any user (`username`), rather than a call per day.

import { getClient } from './client.js';
import type { HistoryItem } from '@b-oss/b-view';

export interface MonthDay {
  entryId: string;
  date: string;
  thumbnailPath: string;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `date` (YYYY-MM-DD) moved by whole `years`. 29 Feb in a non-leap target year becomes 28 Feb
 * rather than rolling over into March. */
export function shiftYear(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const year = y + years;
  const lastDay = new Date(year, m, 0).getDate();
  return `${pad(year, 4)}-${pad(m)}-${pad(Math.min(d, lastDay))}`;
}

/** The days of `year`/`month` (1–12) on which `username` has an entry, keyed by day-of-month. */
export async function fetchMonthDays(
  username: string,
  year: number,
  month: number,
): Promise<Map<number, MonthDay>> {
  const client = await getClient();
  const res = await client.getJournalMonth(`${pad(year, 4)}-${pad(month)}-01`, {
    username,
    weekStart: 1,
  });
  const days = new Map<number, MonthDay>();
  for (const d of res.month.days) {
    if (!d || d.state !== 1 || !d.entry) continue;
    days.set(d.day, {
      entryId: d.entry.entry_id_str,
      date: `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`,
      thumbnailPath: d.entry.thumbnail_url,
    });
  }
  return days;
}

/** For the calendar: day-of-month → entry id. */
export async function fetchCalendarMonth(
  username: string,
  year: number,
  month: number,
): Promise<Record<number, string>> {
  const days = await fetchMonthDays(username, year, month);
  return Object.fromEntries([...days].map(([day, d]) => [day, d.entryId]));
}

/** `username`'s entries exactly one year before and after `date`, where they exist. Rejects only
 * if *every* lookup failed — one failing side still shows the other. */
export async function fetchHistoryItems(username: string, date: string): Promise<HistoryItem[]> {
  const targets = [
    { label: '1 year ago', date: shiftYear(date, -1) },
    { label: '1 year ahead', date: shiftYear(date, 1) },
  ];
  const results = await Promise.allSettled(
    targets.map((t) => {
      const [y, m] = t.date.split('-').map(Number) as [number, number];
      return fetchMonthDays(username, y, m);
    }),
  );
  if (results.every((r) => r.status === 'rejected')) {
    throw results[0].status === 'rejected' ? results[0].reason : new Error('History failed');
  }
  const items: HistoryItem[] = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const day = r.value.get(Number(targets[i].date.slice(8, 10)));
    if (!day) return;
    items.push({
      label: targets[i].label,
      entryId: day.entryId,
      date: day.date,
      thumbnailPath: day.thumbnailPath,
    });
  });
  return items;
}
