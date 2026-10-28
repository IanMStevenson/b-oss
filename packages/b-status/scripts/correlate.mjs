// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A correlation probe: runs the status monitor's own checks from THIS machine at the monitor's
// cadence (every 15 minutes, 30 s after the boundary), so its results can be lined up against the
// status page's. If the API is slow for both, it is the API; if only the Worker sees it, it is
// something about the monitor's route. Not part of the Worker bundle; nothing is sent anywhere
// except the same read-only requests the monitor makes.
//
//   npm run build -w @b-oss/b-status          # once, and after any change to src/
//   MONITOR_CLIENT_ID=... node packages/b-status/scripts/correlate.mjs [--out FILE]
//   node packages/b-status/scripts/correlate.mjs --report [--out FILE]
//   node packages/b-status/scripts/correlate.mjs --once [--out FILE]    # one run now, to test
//
// On an egress-controlled dev box run it with NODE_USE_ENV_PROXY=1 so Node's fetch uses the proxy.
// Add --photo to include the photo check (needs the photo host reachable).
//
// Without MONITOR_CLIENT_ID the API checks are skipped (the website checks still run).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const { runChecks } = await import('../dist/checks.js');
const { deriveStates } = await import('../dist/derive.js');

const INTERVAL_MS = 15 * 60 * 1000;
const START_LAG_MS = 30 * 1000;
const RETRY_DELAY_MS = 30 * 1000;
const SNAPSHOT_URL = 'https://b-status.b-oss.workers.dev/v1/status';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = value('--out') ?? join(homedir(), 'dev', 'tmp', 'b-status-correlate', 'probe.ndjson');

const cfg = {
  siteBase: 'https://www.blipfoto.com',
  apiBase: 'https://api.blipfoto.com/4',
  clientId: process.env.MONITOR_CLIENT_ID || null,
  userAgent:
    'b-oss-status-monitor/0.1 (+https://b-oss.dev; unofficial independent status monitor; correlation probe)',
  timeoutMs: 10_000,
  slowMs: 8_000,
};
// The photo host is a CDN domain that the dev boxes' egress allowlist blocks, so the photo check is
// off unless --photo is given: its HEAD request is answered locally and the result marked skipped.
const withPhoto = flag('--photo');
const deps = {
  fetch: (input, init) =>
    !withPhoto && init?.method === 'HEAD'
      ? Promise.resolve(new Response(null, { status: 200 }))
      : fetch(input, init),
  now: () => Date.now(),
};

const iso = (ts) => new Date(ts).toISOString().slice(11, 19);

async function attempt(n) {
  const ts = Date.now();
  const results = (await runChecks(cfg, deps)).map((r) =>
    !withPhoto && r.id === 'photo'
      ? { id: 'photo', status: 'skipped', ms: 0, detail: 'not probed (use --photo)' }
      : r,
  );
  const states = deriveStates(results);
  const line = { ts, attempt: n, site: states.site.state, api: states.api.state, results };
  mkdirSync(dirname(out), { recursive: true });
  appendFileSync(out, `${JSON.stringify(line)}\n`);
  const brief = results.map((r) => `${r.id}=${r.status === 'pass' ? r.ms : r.status}`).join(' ');
  console.log(`${iso(ts)} #${n} site=${line.site} api=${line.api}  ${brief}`);
  return line;
}

async function runOnce() {
  const first = await attempt(1);
  if (first.site !== 'down' && first.api !== 'down') return;
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  await attempt(2);
}

async function loop() {
  console.log(
    `logging to ${out}${cfg.clientId ? '' : ' (no MONITOR_CLIENT_ID: API checks skipped)'}`,
  );
  for (;;) {
    const now = Date.now();
    let target = Math.floor(now / INTERVAL_MS) * INTERVAL_MS + START_LAG_MS;
    if (target <= now) target += INTERVAL_MS;
    await new Promise((r) => setTimeout(r, Math.max(0, target - Date.now())));
    try {
      await runOnce();
    } catch (err) {
      console.log(`${iso(Date.now())} run failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function report() {
  if (!existsSync(out)) {
    console.log(`no log at ${out}`);
    return;
  }
  const lines = readFileSync(out, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  console.log(`Local attempts that failed or took > 3 s (UTC), from ${out}:`);
  for (const l of lines) {
    const bad = l.results.filter((r) => r.status === 'fail' || r.ms > 3000);
    if (bad.length === 0) continue;
    const day = new Date(l.ts).toISOString().slice(5, 10);
    console.log(
      `  ${day} ${iso(l.ts)} #${l.attempt}  ` +
        bad
          .map((r) => `${r.id} ${r.status} ${r.ms} ms${r.detail ? ` (${r.detail})` : ''}`)
          .join('; '),
    );
  }
  const first = lines.filter((l) => l.attempt === 1);
  console.log(`${first.length} scheduled runs logged; ${lines.length - first.length} retries.`);
  try {
    const res = await fetch(SNAPSHOT_URL);
    const snap = await res.json();
    console.log('\nStatus page incidents (UTC):');
    for (const i of snap.incidents) {
      const day = new Date(i.started_at).toISOString().slice(5, 10);
      const end = i.ended_at === null ? 'ongoing' : iso(i.ended_at);
      console.log(
        `  ${day} ${iso(i.started_at)} to ${end}  ${i.components.join('+')}  ${i.reason ?? i.failed.join(',')}`,
      );
    }
  } catch (err) {
    console.log(
      `\n(could not fetch the status snapshot: ${err instanceof Error ? err.message : err})`,
    );
  }
}

if (flag('--report')) await report();
else if (flag('--once')) await runOnce();
else await loop();
