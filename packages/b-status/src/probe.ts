// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// One probe run: the checks, then — if anything failed — ONE retry a few seconds later. A component
// is only recorded down when it is down on both attempts, so a single blip never paints a red
// sample (b-oss#476 design). The stored checks are those of the final attempt.

import { deriveStates } from './derive.js';
import { runChecks, type ProbeConfig, type ProbeDeps } from './checks.js';
import type { CheckResult, Component, DerivedStates, State } from './types.js';

export const SAMPLE_INTERVAL_MS = 15 * 60 * 1000;

export interface ProbeOutcome {
  /** Epoch ms the run started. */
  ts: number;
  /** floor(ts / 15 min): the primary key of the stored sample. */
  slot: number;
  states: DerivedStates;
  results: CheckResult[];
  retried: boolean;
}

export function slotOf(ts: number): number {
  return Math.floor(ts / SAMPLE_INTERVAL_MS);
}

function confirmed(first: DerivedStates, second: DerivedStates, c: Component): State {
  if (first[c].state === 'down' && second[c].state === 'down') return 'down';
  if (first[c].state === 'up' || second[c].state === 'up') return 'up';
  return 'unknown';
}

export async function runProbe(
  cfg: ProbeConfig,
  deps: ProbeDeps,
  sleep: (ms: number) => Promise<void>,
  retryDelayMs: number,
): Promise<ProbeOutcome> {
  const ts = deps.now();
  const firstResults = await runChecks(cfg, deps);
  const first = deriveStates(firstResults);
  if (first.site.state !== 'down' && first.api.state !== 'down') {
    return { ts, slot: slotOf(ts), states: first, results: firstResults, retried: false };
  }
  await sleep(retryDelayMs);
  const secondResults = await runChecks(cfg, deps);
  const second = deriveStates(secondResults);
  const states: DerivedStates = {
    site: { state: confirmed(first, second, 'site'), failed: second.site.failed },
    api: { state: confirmed(first, second, 'api'), failed: second.api.failed },
  };
  for (const c of ['site', 'api'] as const) {
    if (states[c].state !== 'down') states[c] = { state: states[c].state, failed: [] };
  }
  return { ts, slot: slotOf(ts), states, results: secondResults, retried: true };
}
