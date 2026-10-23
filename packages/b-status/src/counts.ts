// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Per-day, per-component sample counts. "unknown" includes slots with no sample at all (the monitor
// didn't run) from when monitoring began, so a dead monitor never reads as up or down.

import { SLOTS_PER_DAY, dayStartMs, slotOf } from './time.js';
import type { Component, State } from './types.js';

export interface Counts {
  up: number;
  down: number;
  unknown: number;
}

export interface SampleStates {
  slot: number;
  site_state: State;
  api_state: State;
}

/** Counts for one UTC day. `firstSlot` is where monitoring began; `lastSlot` is the newest slot
 * that could exist yet (for a finished day, pass Infinity). */
export function countDay(
  samples: SampleStates[],
  day: string,
  firstSlot: number,
  lastSlot: number,
): Record<Component, Counts> {
  const dayFirst = slotOf(dayStartMs(day));
  const from = Math.max(dayFirst, firstSlot);
  const to = Math.min(dayFirst + SLOTS_PER_DAY - 1, lastSlot);
  const expected = Math.max(0, to - from + 1);
  const out: Record<Component, Counts> = {
    site: { up: 0, down: 0, unknown: 0 },
    api: { up: 0, down: 0, unknown: 0 },
  };
  let rows = 0;
  for (const s of samples) {
    if (s.slot < dayFirst || s.slot >= dayFirst + SLOTS_PER_DAY) continue;
    rows++;
    for (const c of ['site', 'api'] as const) {
      const st = c === 'site' ? s.site_state : s.api_state;
      out[c][st === 'up' ? 'up' : st === 'down' ? 'down' : 'unknown']++;
    }
  }
  const missing = Math.max(0, expected - rows);
  out.site.unknown += missing;
  out.api.unknown += missing;
  return out;
}
