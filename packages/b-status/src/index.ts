// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The Worker entry point: the cron handler probes, stores a sample, folds old days and rebuilds the
// page's snapshot; `GET /v1/status` serves that snapshot, and `POST /v1/shares` takes visitor-shared problems. Deploys
// are manual (see wrangler.toml and README.md); nothing in this repo runs `wrangler`.

import { REFUSED_PREFIX, type ProbeConfig } from './checks.js';
import { recordSample } from './incidents.js';
import { refuseInsecure } from './https-guard.js';
import { describeError } from './log.js';
import { runProbe } from './probe.js';
import { handleStatus } from './serve.js';
import { runMaintenance } from './maintain.js';
import { runTriggeredCheck } from './recheck.js';
import { handleShare } from './shares.js';
import { storeSnapshot } from './snapshot.js';
import type { Env } from './types.js';

/** Identifies the monitor and says where to find out more. The contact URL is revisited in b-oss#487. */
const USER_AGENT =
  'b-oss-status-monitor/0.1 (+https://b-oss.dev; unofficial independent status monitor)';
/** Scheduled runs have plenty of wall time, so the confirming retry waits long enough for a short
 * blip to clear. */
const SCHEDULED_RETRY_DELAY_MS = 30_000;
/** A triggered re-check runs in `ctx.waitUntil`, which Workers cap at about 30 s after the response
 * is sent, and the two attempts can each take up to the 10 s timeout; so its delay stays short. */
const TRIGGERED_RETRY_DELAY_MS = 5_000;

function config(env: Env): ProbeConfig {
  return {
    siteBase: 'https://www.blipfoto.com',
    apiBase: 'https://api.blipfoto.com/4',
    clientId: env.MONITOR_CLIENT_ID ?? null,
    userAgent: USER_AGENT,
    timeoutMs: 10_000,
    slowMs: 8_000,
  };
}

function probeOnce(env: Env, retryDelayMs: number) {
  return runProbe(
    config(env),
    { fetch: (input, init) => fetch(input, init), now: () => Date.now() },
    (ms) => new Promise((r) => setTimeout(r, ms)),
    retryDelayMs,
  );
}

export async function runScheduled(env: Env): Promise<void> {
  const outcome = await probeOnce(env, SCHEDULED_RETRY_DELAY_MS);
  await recordSample(env.DB, outcome);
  // After the sample is stored: fold finished days, then rebuild the page's snapshot from it.
  const { foldedDays: folded } = await runMaintenance(env.DB, outcome.ts);
  await storeSnapshot(env.DB, outcome.ts);
  // The operator alert: a refused monitor (bad token, rate limit) is Unknown on the page, so make
  // it loud in the logs instead. Filter Workers Logs on "MONITOR REFUSED".
  const refused = outcome.results.filter((r) => r.detail?.startsWith(REFUSED_PREFIX));
  if (refused.length > 0)
    console.warn(
      `[b-status] MONITOR REFUSED slot ${outcome.slot}: ${refused.map((r) => `${r.id} ${r.detail}`).join('; ')}`,
    );
  console.log(
    `[b-status] slot ${outcome.slot} site=${outcome.states.site.state} api=${outcome.states.api.state}` +
      `${outcome.retried ? ' (retried)' : ''}${folded > 0 ? ` folded ${folded} day(s)` : ''}`,
  );
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    try {
      await runScheduled(env);
    } catch (err) {
      console.error(`[b-status] run failed: ${describeError(err)}`);
    }
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const insecure = refuseInsecure(request);
    if (insecure) return insecure;

    const path = new URL(request.url).pathname;
    if (path === '/v1/status') return handleStatus(request, env.DB, Date.now());
    if (path === '/v1/shares') {
      return handleShare(request, env, env.DB, {
        fetch: (input, init) => fetch(input, init),
        now: () => Date.now(),
        waitUntil: (work) => ctx.waitUntil(work),
        triggerCheck: () =>
          runTriggeredCheck(env.DB, {
            probe: () => probeOnce(env, TRIGGERED_RETRY_DELAY_MS),
            now: () => Date.now(),
          }),
      });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
