// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The Worker entry point. Only the cron handler exists so far: it probes and stores one sample.
// The public JSON endpoint and the snapshot build are b-oss#484; reports are b-oss#486. Deploys
// are manual (see wrangler.toml and README.md); nothing in this repo runs `wrangler`.

import type { ProbeConfig } from './checks.js';
import { recordSample } from './incidents.js';
import { describeError } from './log.js';
import { runProbe } from './probe.js';
import type { Env } from './types.js';

/** Identifies the monitor and says where to find out more. The contact URL is revisited in b-oss#487. */
const USER_AGENT =
  'b-oss-status-monitor/0.1 (+https://b-oss.dev; unofficial independent status monitor)';
const RETRY_DELAY_MS = 5_000;

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

export async function runScheduled(env: Env): Promise<void> {
  const outcome = await runProbe(
    config(env),
    { fetch: (input, init) => fetch(input, init), now: () => Date.now() },
    (ms) => new Promise((r) => setTimeout(r, ms)),
    RETRY_DELAY_MS,
  );
  await recordSample(env.DB, outcome);
  console.log(
    `[b-status] slot ${outcome.slot} site=${outcome.states.site.state} api=${outcome.states.api.state}` +
      `${outcome.retried ? ' (retried)' : ''}`,
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
  fetch(): Response {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
