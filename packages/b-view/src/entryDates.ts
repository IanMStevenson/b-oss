// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

/** The two lines of the nav strip's date tile — "2nd" over "Oct, 26" — from a `YYYY-MM-DD`
 * entry date. Parsed from the string, not through `Date`, so the calendar date can't shift with
 * the viewer's timezone. `null` for anything that isn't a well-formed date (the tile then shows
 * the raw string rather than garbage). */
export function formatStripDate(isoDate: string): { day: string; monthYear: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    day: `${day}${ordinalSuffix(day)}`,
    monthYear: `${MONTHS_SHORT[month - 1]}, ${m[1].slice(2)}`,
  };
}

/** "2nd Oct 2026" for the lightbox header, from a `YYYY-MM-DD` entry date (parsed from the string,
 * timezone-proof like formatStripDate). Anything malformed comes back unchanged. */
export function formatLongDate(isoDate: string): string {
  const parts = formatStripDate(isoDate);
  if (!parts) return isoDate;
  const [mon] = parts.monthYear.split(', ');
  return `${parts.day} ${mon} ${isoDate.slice(0, 4)}`;
}
