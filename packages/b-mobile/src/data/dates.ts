// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Small date helpers shared by SCR-09/SCR-10/journal.ts — plain 'YYYY-MM-DD' local-date strings
// throughout (the API's own date format), never a Date object crossing a module boundary, so
// there's exactly one place that has to get local-vs-UTC right.

export function todayDate(): string {
  return formatLocalDate(new Date());
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Blipfoto's gmt_offset field (undocumented in AppSpec beyond its presence in PublishEntryParams)
 * — minutes east of UTC, the standard convention (JS's own getTimezoneOffset() is minutes *west*,
 * hence the negation). Best-effort: the field is optional, and an implementer who later finds the
 * API's own documented convention should fix this in one place. */
export function gmtOffsetMinutes(date: Date = new Date()): number {
  return -date.getTimezoneOffset();
}
