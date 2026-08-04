// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// journal/month + journal/day fetchers for SCR-10's publish-eligibility (FLW-12 step 3, the
// one-per-day rule). `toDayEligibility` is pure logic (§19 layer 1) mapping BlipDay.state to
// exactly SCR-10's own wording table, kept separate from the fetchers so it's directly
// unit-testable without a client/mock.
//
// SCR-10: "suspended" (state 2) uses the identical message to "already an entry" (state 1) —
// deliberate, the website doesn't reveal suspension here and neither does this app — but only
// state 1 offers the "jump to that entry" affordance; state 2's entry stub (if the server even
// returns one) is deliberately not surfaced for the same reason.

import { getClient } from './client.js';
import type { BlipDay } from '@b-oss/b-api';

export interface DayEligibility {
  publishable: boolean;
  /** null only for the free/publishable state — every ineligible state has SCR-10's exact wording. */
  message: string | null;
  /** SCR-10's one specific affordance ("jump to that entry") — only ever set for state 1. */
  existingEntryId: string | null;
}

export function toDayEligibility(day: BlipDay): DayEligibility {
  switch (day.state) {
    case 0:
      return { publishable: true, message: null, existingEntryId: null };
    case 1:
      return {
        publishable: false,
        message: 'You already have an entry for that day.',
        existingEntryId: day.entry?.entry_id_str ?? null,
      };
    case 2:
      // Suspended — same message as "already an entry" (deliberate, SCR-10), no jump affordance.
      return {
        publishable: false,
        message: 'You already have an entry for that day.',
        existingEntryId: null,
      };
    case 3:
      return { publishable: false, message: 'That date is in the future.', existingEntryId: null };
    case 4:
      return {
        publishable: false,
        message: 'That date is too far in the past.',
        existingEntryId: null,
      };
    case 5:
    default:
      // "Blocked" has no defined message anywhere (SCR-10) — a neutral message rather than
      // inventing a reason. Also the fallback for any future/unknown state value.
      return {
        publishable: false,
        message: "You can't publish an entry for that date.",
        existingEntryId: null,
      };
  }
}

/** date: 'YYYY-MM-DD'. Keyed the same way in the returned map for O(1) picker lookups. */
export async function fetchMonthEligibility(date: string): Promise<Record<string, DayEligibility>> {
  const client = await getClient();
  const res = await client.getJournalMonth(date);
  const map: Record<string, DayEligibility> = {};
  for (const day of res.days) {
    if (!day) continue;
    const key = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
    map[key] = toDayEligibility(day);
  }
  return map;
}

export async function fetchDayEligibility(date: string): Promise<DayEligibility> {
  const client = await getClient();
  const res = await client.getJournalDay(date);
  return toDayEligibility(res.day);
}
