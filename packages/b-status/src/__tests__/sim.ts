// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A simulated week of monitoring, shared by the fold/history/snapshot tests.

import type { DbLike } from '../db.js';
import { recordSample } from '../incidents.js';
import { INTERVAL_MS, slotOf } from '../time.js';
import type { ProbeOutcome } from '../probe.js';
import type { CheckId, CheckResult, ComponentState, State } from '../types.js';

export const START = Date.UTC(2026, 9, 18, 0, 0); // Sun 18 Oct 2026 00:00 UTC
export const NOW = Date.UTC(2026, 9, 23, 12, 0); // Fri 23 Oct 2026 12:00 UTC

export const at = (day: number, h: number, m = 0): number => Date.UTC(2026, 9, day, h, m);

interface Event {
  from: number;
  /** Exclusive. */
  to: number;
  site?: State;
  api?: State;
  failed?: CheckId[];
  /** No sample at all in this period (the monitor didn't run). */
  skip?: boolean;
}

export function outcomeAt(ts: number, events: Event[]): ProbeOutcome | null {
  let site: State = 'up';
  let api: State = 'up';
  let failed: CheckId[] = [];
  for (const e of events) {
    if (ts < e.from || ts >= e.to) continue;
    if (e.skip) return null;
    site = e.site ?? site;
    api = e.api ?? api;
    failed = e.failed ?? failed;
  }
  const cs = (state: State): ComponentState => ({
    state,
    failed: state === 'down' ? failed : [],
  });
  const results: CheckResult[] = failed.map((id) => ({ id, status: 'fail', ms: 1 }));
  return {
    ts,
    slot: slotOf(ts),
    states: { site: cs(site), api: cs(api) },
    results,
    retried: false,
  };
}

/** Record a sample for every 15-minute slot in [from, to] inclusive, applying `events`. */
export async function simulate(db: DbLike, events: Event[], from = START, to = NOW): Promise<void> {
  for (let ts = from; ts <= to; ts += INTERVAL_MS) {
    const o = outcomeAt(ts, events);
    if (o) await recordSample(db, o);
  }
}

/** The standard week: a Site blip on the 19th, a photo outage on the 22nd, a gap on the 21st and an
 * ongoing API outage at the end. */
export const WEEK: Event[] = [
  { from: at(19, 3), to: at(19, 3, 30), site: 'down', failed: ['website_browse'] },
  { from: at(21, 14), to: at(21, 15), skip: true },
  { from: at(22, 9), to: at(22, 9, 15), site: 'down', api: 'down', failed: ['photo'] },
  { from: at(23, 11, 45), to: NOW + 1, api: 'down', failed: ['api_recent'] },
];
