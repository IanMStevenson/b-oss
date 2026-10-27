// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A visitor's report triggers an immediate re-check (b-oss#561, approach A: run inside the share
// request via `ctx.waitUntil`). The body is ONE function, `runTriggeredCheck`, so a once-a-minute
// cron (approach B, the documented fallback) can call it instead without a rewrite.
//
// The re-check may only turn an UP into a confirmed DOWN for the CURRENT slot. It never improves a
// state, never writes a second sample row and never touches a slot that has no sample yet (the
// scheduled run is seconds away). Failing safe is the point: on the free plan the request's 10 ms
// CPU limit is shared with this work, so it can be cut off; every write is a small batch, the
// share's 201 is already sent, and the log lines say whether it ever finished.

import type { DbLike } from './db.js';
import { describeError } from './log.js';
import { incidentStatements, loadOpenIncidents } from './incidents.js';
import type { ProbeOutcome } from './probe.js';
import { storeSnapshot } from './snapshot.js';
import { INTERVAL_MS, slotOf } from './time.js';
import type { Component, DerivedStates, SampleRow } from './types.js';

export const MIN_GAP_MS = 5 * 60 * 1000;
export const MIN_REMAINING_MS = 5 * 60 * 1000;
/** The cron fires about 30 s after each 15-minute boundary, so the next scheduled check is the
 * boundary plus this. */
export const CRON_LAG_MS = 30 * 1000;

export interface TriggerState {
  now: number;
  /** The slot that last had a triggered check, or null. */
  triggeredSlot: number | null;
  /** When the last check of any kind ran (scheduled or triggered), or null. */
  lastCheckAt: number | null;
}

export type TriggerDecision =
  | { run: true; reason: 'first-in-cycle' | 'spaced' }
  | { run: false; reason: 'too-soon' | 'next-check-near' };

/** The trigger rule. The first report in a 15-minute cycle always triggers; a later one only if at
 * least 5 minutes have passed since the last check AND more than 5 minutes remain until the next
 * scheduled check (next boundary plus the cron's usual lag). */
export function decideTrigger(s: TriggerState): TriggerDecision {
  const slot = slotOf(s.now);
  if (s.triggeredSlot !== slot) return { run: true, reason: 'first-in-cycle' };
  if (s.lastCheckAt !== null && s.now - s.lastCheckAt < MIN_GAP_MS) {
    return { run: false, reason: 'too-soon' };
  }
  const nextScheduled = (slot + 1) * INTERVAL_MS + CRON_LAG_MS;
  if (nextScheduled - s.now <= MIN_REMAINING_MS) return { run: false, reason: 'next-check-near' };
  return { run: true, reason: 'spaced' };
}

export interface TriggeredDeps {
  /** One normal probe run (with its confirm-with-retry). */
  probe: () => Promise<ProbeOutcome>;
  now: () => number;
  log?: (line: string) => void;
}

const COMPONENTS: Component[] = ['site', 'api'];

async function readTriggerState(db: DbLike, now: number): Promise<TriggerState> {
  const meta = (
    await db
      .prepare("SELECT key, value FROM meta WHERE key IN ('triggered_slot', 'triggered_at')")
      .all<{ key: string; value: string }>()
  ).results;
  const m = new Map(meta.map((r) => [r.key, Number(r.value)]));
  const snap = await db
    .prepare('SELECT generated_at FROM snapshot WHERE id = 1')
    .first<{ generated_at: number }>();
  // The snapshot's generated_at is the last scheduled check; `triggered_at` the last triggered one.
  // (A triggered check that finds nothing wrong deliberately does not rebuild the snapshot.)
  const checks = [snap?.generated_at, m.get('triggered_at')].filter(
    (v): v is number => v !== undefined,
  );
  return {
    now,
    triggeredSlot: m.get('triggered_slot') ?? null,
    lastCheckAt: checks.length > 0 ? Math.max(...checks) : null,
  };
}

/** Which components went up -> confirmed down, given the slot's stored sample. */
function turnedDown(sample: SampleRow, states: DerivedStates): Component[] {
  return COMPONENTS.filter(
    (c) =>
      (c === 'site' ? sample.site_state : sample.api_state) === 'up' && states[c].state === 'down',
  );
}

/** Decide, check, and (only if something is newly down in the current slot) record it. Never
 * throws: a failure is logged and the share that triggered it is unaffected. */
export async function runTriggeredCheck(db: DbLike, deps: TriggeredDeps): Promise<void> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const started = deps.now();
  const slot = slotOf(started);
  try {
    const sample = await db
      .prepare(
        'SELECT slot, ts, site_state, api_state, retried, checks FROM samples WHERE slot = ?',
      )
      .bind(slot)
      .first<SampleRow>();
    if (!sample) {
      // The share beat the scheduled run: it is seconds away. Nothing recorded, so a later report
      // this cycle is still the first.
      log(`[b-status] triggered check skipped slot=${slot}: no sample for this slot yet`);
      return;
    }
    const decision = decideTrigger(await readTriggerState(db, started));
    if (!decision.run) {
      log(`[b-status] triggered check skipped slot=${slot}: ${decision.reason}`);
      return;
    }
    // Claim the cycle BEFORE probing, so a run that is cut off still counts (politeness over
    // completeness) and a burst of reports cannot start a burst of probes.
    await db.batch([
      db
        .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('triggered_slot', ?)")
        .bind(String(slot)),
      db
        .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('triggered_at', ?)")
        .bind(String(started)),
    ]);
    log(`[b-status] triggered check start slot=${slot} (${decision.reason})`);

    const outcome = await deps.probe();
    let changed: Component[] = [];
    if (outcome.slot === slot) {
      // Re-read: the scheduled run may have written since the check above.
      const current = await db
        .prepare(
          'SELECT slot, ts, site_state, api_state, retried, checks FROM samples WHERE slot = ?',
        )
        .bind(slot)
        .first<SampleRow>();
      if (current) changed = turnedDown(current, outcome.states);
      if (current && changed.length > 0) await applyDown(db, current, outcome, changed);
    }
    if (changed.length > 0) await storeSnapshot(db, outcome.ts);
    log(
      `[b-status] triggered check done slot=${slot} elapsed=${deps.now() - started}ms` +
        ` site=${outcome.states.site.state} api=${outcome.states.api.state}` +
        `${outcome.retried ? ' (retried)' : ''} changed=${changed.length > 0 ? changed.join(',') : 'none'}`,
    );
  } catch (err) {
    log(
      `[b-status] triggered check failed slot=${slot} elapsed=${deps.now() - started}ms: ${describeError(err)}`,
    );
  }
}

async function applyDown(
  db: DbLike,
  sample: SampleRow,
  outcome: ProbeOutcome,
  changed: Component[],
): Promise<void> {
  const open = await loadOpenIncidents(db);
  // Only the components that turned down: `unknown` for the rest neither opens nor closes anything.
  const states: DerivedStates = {
    site: changed.includes('site') ? outcome.states.site : { state: 'unknown', failed: [] },
    api: changed.includes('api') ? outcome.states.api : { state: 'unknown', failed: [] },
  };
  await db.batch([
    db
      .prepare(
        'UPDATE samples SET site_state = ?, api_state = ?, retried = 1, checks = ? WHERE slot = ?',
      )
      .bind(
        changed.includes('site') ? 'down' : sample.site_state,
        changed.includes('api') ? 'down' : sample.api_state,
        JSON.stringify(outcome.results),
        sample.slot,
      ),
    ...incidentStatements(db, open, { ts: outcome.ts, states }),
  ]);
}
