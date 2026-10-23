// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// UTC time helpers. Samples are 15-minute slots; "days" are UTC days everywhere (the page says so).

export const INTERVAL_MS = 15 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SLOTS_PER_DAY = DAY_MS / INTERVAL_MS; // 96
/** Grace after the next cron slot before a client should expect fresher data (cron isn't punctual). */
export const REFRESH_GRACE_MS = 90 * 1000;

export const slotOf = (ts: number): number => Math.floor(ts / INTERVAL_MS);
export const startOfUtcDay = (ts: number): number => ts - (ts % DAY_MS);
export const dayOf = (ts: number): string => new Date(ts).toISOString().slice(0, 10);
export const dayStartMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day: string, n: number): string => dayOf(dayStartMs(day) + n * DAY_MS);

/** The Monday on or before `day`. */
export function weekStart(day: string): string {
  const dow = new Date(dayStartMs(day)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/** The last UTC day whose samples have been folded into day rows at `now`: days that ended at
 * least 48 hours ago, so the 48-hour view is always drawn from raw samples. */
export function foldedThrough(now: number): string {
  return dayOf(startOfUtcDay(now - 2 * DAY_MS) - 1);
}
