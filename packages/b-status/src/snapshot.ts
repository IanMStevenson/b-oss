// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The status page's whole data bundle, built ONCE per cron run and stored in a single D1 row
// (`snapshot`). A page view never touches D1 in the normal case (serve.ts), so traffic spikes —
// which coincide with Blipfoto outages — can't eat the account's shared free-tier quota.
// Everything the page draws is in here, so it makes one request per load.

import { countDay, type SampleStates } from './counts.js';
import type { DbLike } from './db.js';
import { loadHistory, type HistoryEntry, type Totals, type WindowKey } from './history.js';
import { MINUTES_PER_SAMPLE } from './fold.js';
import {
  DAY_MS,
  HOUR_MS,
  INTERVAL_MS,
  REFRESH_GRACE_MS,
  addDays,
  dayOf,
  dayStartMs,
  slotOf,
} from './time.js';
import type { CheckId, CheckResult, Component, IncidentRow, State } from './types.js';

const COMPONENTS: Component[] = ['site', 'api'];
const INCIDENT_CAP = 100;

export interface Segment {
  kind: 'down' | 'nodata';
  start: number;
  /** null = still going (a down segment drawn flush to "now"). */
  end: number | null;
  failed?: CheckId[];
  /** Plain reason the first failed check gave ("timed out after 10 s"); absent once the raw samples
   * have been folded away. */
  reason?: string;
}

export interface UptimeWindow {
  /** Percent rounded DOWN to 3 places (so the page can show fewer without ever rounding up); 100
   * only when nothing was measured down; null = no data. */
  uptime: number | null;
  down_minutes: number;
  incidents: number;
}

export interface SnapshotIncident {
  id: number;
  components: Component[];
  started_at: number;
  ended_at: number | null;
  failed: CheckId[];
  reason?: string;
}

export interface StatusSnapshot {
  version: 1;
  generated_at: number;
  /** When fresher data can exist: the next cron slot plus a grace. Clients must not refetch earlier. */
  next_refresh_at: number;
  /** When monitoring began (epoch ms); null before the first sample. */
  monitoring_since: number | null;
  definition: {
    sample_interval_minutes: number;
    uptime: string;
    days: string;
    windows: string;
  };
  now: Record<
    Component,
    { state: State; checked_at: number | null; failed: CheckId[]; stale: boolean }
  >;
  last48h: { from: number; to: number } & Record<Component, Segment[]>;
  history: {
    first_day: string | null;
    /** The History chart: the last 30 UTC days (ending today), non-empty days only (the page fills
     * the gaps). Longer periods are covered by `uptime` and `incidents`. */
    days: Record<Component, HistoryEntry[]>;
  };
  uptime: Record<Component, Record<'h24' | 'd7' | 'd30' | 'd365' | 'all', UptimeWindow>>;
  incidents: SnapshotIncident[];
  /** Visitor-shared problems per part: unverified, never part of uptime. */
  shares: {
    /** [hour start epoch ms, count] for the last 48 hours. */
    hours: Record<Component, [number, number][]>;
    /** [UTC day, count] for the last 30 days. */
    days: Record<Component, [string, number][]>;
  };
}

interface LiveSample extends SampleStates {
  ts: number;
}

/** Uptime % rounded DOWN to 3 decimal places, so 100 means nothing at all was found down. The page
 * decides how many to show (one, or up to three for 99.9x figures). */
export function uptimePercent(down: number, known: number): number | null {
  if (known <= 0) return null;
  if (down <= 0) return 100;
  return Math.floor((100000 * (known - down)) / known) / 1000;
}

function window(totals: Totals): UptimeWindow {
  return {
    uptime: uptimePercent(totals[0], totals[1]),
    down_minutes: totals[0] * MINUTES_PER_SAMPLE,
    incidents: totals[2],
  };
}

/** A failed check's detail as a short plain phrase: "timed out after 10 s", "HTTP 503". */
function describeFailure(r: CheckResult): string {
  const secs = Math.round(r.ms / 1000);
  switch (r.detail) {
    case 'timeout':
      return `timed out after ${secs} s`;
    case 'network error':
      return 'connection failed';
    case 'too slow':
      return `too slow (${(r.ms / 1000).toFixed(1)} s)`;
    default:
      return r.detail ?? 'failed';
  }
}

/** The reason for an incident: what its failed checks said in the sample that opened it, deduped. */
function reasonOf(checksJson: string | undefined, failed: CheckId[]): string | undefined {
  if (!checksJson) return undefined;
  let results: CheckResult[];
  try {
    results = JSON.parse(checksJson) as CheckResult[];
  } catch {
    return undefined;
  }
  const reasons = [
    ...new Set(
      results.filter((r) => r.status === 'fail' && failed.includes(r.id)).map(describeFailure),
    ),
  ];
  return reasons.length > 0 ? reasons.slice(0, 2).join(', ') : undefined;
}

function stateOf(s: SampleStates, c: Component): State {
  return c === 'site' ? s.site_state : s.api_state;
}

/** Slots in [from, to] with no sample, or an Unknown one, merged into contiguous segments. */
function noDataSegments(
  samples: LiveSample[],
  c: Component,
  from: number,
  to: number,
  firstSlot: number,
): Segment[] {
  const bySlot = new Map(samples.map((s) => [s.slot, s]));
  const out: Segment[] = [];
  for (let slot = Math.max(slotOf(from), firstSlot); slot <= slotOf(to); slot++) {
    const s = bySlot.get(slot);
    if (s && stateOf(s, c) !== 'unknown') continue;
    const start = Math.max(slot * INTERVAL_MS, from);
    const end = Math.min((slot + 1) * INTERVAL_MS, to);
    const last = out[out.length - 1];
    if (last && last.end === start) last.end = end;
    else out.push({ kind: 'nodata', start, end });
  }
  return out;
}

export async function buildSnapshot(db: DbLike, now: number): Promise<StatusSnapshot> {
  const history = await loadHistory(db, now);
  const live = (
    await db
      .prepare('SELECT slot, ts, site_state, api_state FROM samples ORDER BY ts')
      .all<LiveSample>()
  ).results;
  const incidents = (
    await db
      .prepare('SELECT * FROM incidents ORDER BY started_at DESC LIMIT ?')
      .bind(INCIDENT_CAP)
      .all<IncidentRow>()
  ).results;
  // What each incident's opening sample said (raw samples only reach back a couple of days).
  const openers = new Map<string, string>(
    incidents.length === 0
      ? []
      : (
          await db
            .prepare(
              `SELECT ts, checks FROM samples WHERE ts IN (${incidents.map(() => '?').join(',')})`,
            )
            .bind(...incidents.map((i) => i.started_at))
            .all<{ ts: number; checks: string }>()
        ).results.map((r) => [String(r.ts), r.checks]),
  );
  const reasonFor = (i: IncidentRow): string | undefined =>
    reasonOf(openers.get(String(i.started_at)), i.failed_checks.split(',') as CheckId[]);
  const liveShares = (
    await db
      .prepare('SELECT ts, component FROM shares WHERE ts >= ?')
      .bind(dayStartMs(addDays(history.through, 1)))
      .all<{ ts: number; component: Component }>()
  ).results;
  const firstRow = await db.prepare("SELECT value FROM meta WHERE key = 'first_ts'").first<{
    value: string;
  }>();
  const firstTs = firstRow ? Number(firstRow.value) : null;
  const firstSlot = firstTs === null ? Infinity : slotOf(firstTs);
  const nowSlot = slotOf(now);
  const latest = live[live.length - 1];

  // Live (unfolded) UTC days: the day after the fold boundary up to today.
  const liveDays: string[] = [];
  for (let d = addDays(history.through, 1); d <= dayOf(now); d = addDays(d, 1)) liveDays.push(d);

  const nowBlock = {} as StatusSnapshot['now'];
  const last48 = { from: now - 2 * DAY_MS, to: now } as StatusSnapshot['last48h'];
  const days = { site: [...history.days.site], api: [...history.days.api] };
  const uptime = {} as StatusSnapshot['uptime'];

  for (const c of COMPONENTS) {
    const open = incidents.find((i) => i.component === c && i.ended_at === null);
    const stale = !latest || now - latest.ts > 2 * INTERVAL_MS;
    nowBlock[c] = {
      state: stale || !latest ? 'unknown' : stateOf(latest, c),
      checked_at: latest?.ts ?? null,
      failed: !stale && open ? (open.failed_checks.split(',') as CheckId[]) : [],
      stale,
    };

    // 48-hour lanes: down periods from incidents, no-data periods from the slots.
    const down: Segment[] = incidents
      .filter((i) => i.component === c && (i.ended_at ?? now) > last48.from && i.started_at <= now)
      .map((i) => ({
        kind: 'down' as const,
        start: Math.max(i.started_at, last48.from),
        end: i.ended_at === null ? null : Math.min(i.ended_at, now),
        failed: i.failed_checks.split(',') as CheckId[],
        reason: reasonFor(i),
      }))
      .sort((a, b) => a.start - b.start);
    last48[c] = [...down, ...noDataSegments(live, c, last48.from, now, firstSlot)].sort(
      (a, b) => a.start - b.start,
    );

    // Live days merge into the daily and weekly history and the uptime windows.
    const totals: Record<WindowKey, Totals> = {
      w7: [...history.totals[c].w7],
      w30: [...history.totals[c].w30],
      w365: [...history.totals[c].w365],
      all: [...history.totals[c].all],
    };
    for (const day of liveDays) {
      const counts = countDay(live, day, firstSlot, nowSlot)[c];
      const start = dayStartMs(day);
      const inc = incidents.filter(
        (i) => i.component === c && i.started_at >= start && i.started_at < start + DAY_MS,
      ).length;
      const downMin = counts.down * MINUTES_PER_SAMPLE;
      const noDataMin = counts.unknown * MINUTES_PER_SAMPLE;
      if (downMin > 0 || noDataMin > 0 || inc > 0) {
        days[c].push([day, downMin, inc, noDataMin]);
      }
      for (const k of ['w7', 'w30', 'w365', 'all'] as WindowKey[]) {
        totals[k][0] += counts.down;
        totals[k][1] += counts.up + counts.down;
        totals[k][2] += inc;
      }
    }
    // The last 24 hours are exact, from raw samples (the raw rows always cover at least 48 hours).
    const cut = now - DAY_MS;
    const recent = live.filter((s) => s.ts >= cut);
    const down24 = recent.filter((s) => stateOf(s, c) === 'down').length;
    const known24 = recent.filter((s) => stateOf(s, c) !== 'unknown').length;
    const inc24 = incidents.filter((i) => i.component === c && i.started_at >= cut).length;
    uptime[c] = {
      h24: window([down24, known24, inc24]),
      d7: window(totals.w7),
      d30: window(totals.w30),
      d365: window(totals.w365),
      all: window(totals.all),
    };
  }

  // Visitor shares: folded days from the cache, live (unfolded) rows bucketed here.
  const shares: StatusSnapshot['shares'] = {
    hours: { site: [], api: [] },
    days: { site: [], api: [] },
  };
  const hourFrom = now - 2 * DAY_MS;
  for (const c of COMPONENTS) {
    const hours = new Map<number, number>();
    const liveDayCounts = new Map<string, number>();
    for (const r of liveShares.filter((x) => x.component === c)) {
      const d = dayOf(r.ts);
      liveDayCounts.set(d, (liveDayCounts.get(d) ?? 0) + 1);
      if (r.ts >= hourFrom) {
        const h = r.ts - (r.ts % HOUR_MS);
        hours.set(h, (hours.get(h) ?? 0) + 1);
      }
    }
    shares.hours[c] = [...hours.entries()].sort((a, b) => a[0] - b[0]);
    shares.days[c] = [
      ...history.shares.days[c],
      ...[...liveDayCounts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    ];
  }

  // One row per outage; a single cause that took both components down over the same period is one row.
  const combined: SnapshotIncident[] = [];
  for (const i of incidents) {
    const twin = combined.find(
      (x) =>
        x.components[0] !== i.component &&
        x.components.length === 1 &&
        x.started_at === i.started_at &&
        x.ended_at === i.ended_at,
    );
    const failed = i.failed_checks.split(',') as CheckId[];
    if (twin) {
      twin.components = ['site', 'api'];
      twin.failed = [...new Set([...twin.failed, ...failed])];
    } else {
      combined.push({
        id: i.id,
        components: [i.component],
        started_at: i.started_at,
        ended_at: i.ended_at,
        failed,
        reason: reasonFor(i),
      });
    }
  }

  return {
    version: 1,
    generated_at: now,
    next_refresh_at: (nowSlot + 1) * INTERVAL_MS + REFRESH_GRACE_MS,
    monitoring_since: firstTs,
    definition: {
      sample_interval_minutes: INTERVAL_MS / 60_000,
      uptime:
        'Share of checked time that each part worked, rounded down; periods with no data are left out.',
      days: 'Days are UTC days. Times of day are shown in UK time by the page.',
      windows:
        'Last 24 hours is exact. Longer periods count whole UTC days, including today so far.',
    },
    now: nowBlock,
    last48h: last48,
    history: {
      first_day: history.first_day,
      days,
    },
    uptime,
    incidents: combined,
    shares,
  };
}

export async function storeSnapshot(db: DbLike, now: number): Promise<StatusSnapshot> {
  const snap = await buildSnapshot(db, now);
  await db
    .prepare(
      'INSERT OR REPLACE INTO snapshot (id, json, generated_at, next_refresh_at) VALUES (1, ?, ?, ?)',
    )
    .bind(JSON.stringify(snap), snap.generated_at, snap.next_refresh_at)
    .run();
  return snap;
}
