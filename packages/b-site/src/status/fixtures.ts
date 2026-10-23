// Fixture snapshots for the dev preview (`?fixture=<name>` on `npm run dev`), the unit tests and
// the headless-browser checks. Built relative to `now`, so ages ("checked 6 minutes ago") read
// naturally whenever they are loaded. The shapes follow packages/b-status/src/snapshot.ts.

import type {
  Component,
  HistoryEntry,
  Segment,
  Shares,
  SnapshotIncident,
  StatusSnapshot,
  UptimeKey,
  UptimeWindow,
} from './types';

export const FIXTURE_NAMES = [
  'all-good',
  'api-down',
  'both-down',
  'unknown',
  'busy',
  'new',
  'stale',
] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const day = (ts: number): string => new Date(ts).toISOString().slice(0, 10);

function monday(d: string): string {
  const ms = Date.parse(`${d}T00:00:00Z`);
  const dow = new Date(ms).getUTCDay();
  return day(ms - ((dow + 6) % 7) * DAY);
}

type Ev = [daysAgo: number, downMin: number, incidents: number, noDataMin?: number];

/** Daily entries from events, and the weekly roll-up of the same. */
function history(now: number, events: Ev[]): { days: HistoryEntry[]; weeks: HistoryEntry[] } {
  const today = Date.parse(`${day(now)}T00:00:00Z`);
  const days: HistoryEntry[] = events
    .map(([ago, down, inc, nd = 0]): HistoryEntry => [day(today - ago * DAY), down, inc, nd])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const weeks = new Map<string, HistoryEntry>();
  for (const [d, down, inc, nd] of days) {
    const wk = monday(d);
    const w = weeks.get(wk) ?? [wk, 0, 0, 0];
    w[1] += down;
    w[2] += inc;
    w[3] += nd;
    weeks.set(wk, w);
  }
  return { days, weeks: [...weeks.values()] };
}

const win = (uptime: number | null, down: number, incidents: number): UptimeWindow => ({
  uptime,
  down_minutes: down,
  incidents,
});
const perfect = (): Record<UptimeKey, UptimeWindow> => ({
  h24: win(100, 0, 0),
  d7: win(100, 0, 0),
  d30: win(100, 0, 0),
  d365: win(99.98, 60, 3),
  all: win(99.97, 180, 4),
});

function base(now: number): StatusSnapshot {
  const generated = now - 6 * MIN;
  const none = (): { days: HistoryEntry[]; weeks: HistoryEntry[] } => ({ days: [], weeks: [] });
  return {
    version: 1,
    generated_at: generated,
    next_refresh_at: generated + 15 * MIN + 90_000,
    monitoring_since: Date.parse('2025-03-03T09:15:00Z'),
    definition: {
      sample_interval_minutes: 15,
      uptime:
        'Share of checked time that each part worked, rounded down; periods with no data are left out.',
      days: 'Days are UTC days. Times of day are shown in UK time by the page.',
      windows:
        'Last 24 hours is exact. Longer periods count whole UTC days, including today so far.',
    },
    now: {
      site: { state: 'up', checked_at: generated, failed: [], stale: false },
      api: { state: 'up', checked_at: generated, failed: [], stale: false },
    },
    last48h: { from: now - 48 * HOUR, to: now, site: [], api: [] },
    history: {
      first_day: '2025-03-03',
      days: { site: none().days, api: none().days },
      weeks: { site: none().weeks, api: none().weeks },
    },
    uptime: { site: perfect(), api: perfect() },
    incidents: [],
  };
}

const inc = (
  id: number,
  components: Component[],
  startAgo: number,
  endAgo: number | null,
  now: number,
  failed: SnapshotIncident['failed'],
): SnapshotIncident => ({
  id,
  components,
  started_at: now - startAgo,
  ended_at: endAgo === null ? null : now - endAgo,
  failed,
});

const shares = (
  now: number,
  siteCounts: [number, number][],
  apiCounts: [number, number][],
): Shares => {
  const hourStart = Math.floor(now / HOUR) * HOUR;
  const h = (rows: [number, number][]): [number, number][] =>
    rows.map(([ago, n]): [number, number] => [hourStart - ago * HOUR, n]);
  return {
    hours: { site: h(siteCounts), api: h(apiCounts) },
    days: { site: [[day(now - 15 * DAY), 5]], api: [[day(now - 15 * DAY), 2]] },
    weeks: { site: [[monday(day(now - 15 * DAY)), 5]], api: [[monday(day(now - 15 * DAY)), 2]] },
  };
};

const OLD_INCIDENTS = (now: number): SnapshotIncident[] => [
  inc(8, ['api'], 12 * DAY + 4 * HOUR, 12 * DAY + 3.5 * HOUR, now, ['api_recent']),
  inc(7, ['site'], 41 * DAY, 41 * DAY - 15 * MIN, now, ['website_browse']),
  inc(6, ['api'], 63 * DAY, 63 * DAY - 15 * MIN, now, ['api_recent']),
  inc(5, ['site'], 140 * DAY, 140 * DAY - 30 * MIN, now, ['website_entry']),
  inc(4, ['api'], 150 * DAY, 150 * DAY - 15 * MIN, now, ['api_entry']),
  inc(3, ['api'], 190 * DAY, 190 * DAY - 15 * MIN, now, ['api_recent']),
  inc(2, ['site'], 260 * DAY, 260 * DAY - 15 * MIN, now, ['website_browse']),
  inc(1, ['api'], 300 * DAY, 300 * DAY - 30 * MIN, now, ['api_entry']),
];

export function makeFixture(name: FixtureName, now: number): StatusSnapshot {
  const s = base(now);
  const quiet = history(now, [
    [45, 15, 1],
    [12, 30, 1],
  ]);
  s.history.days.site = quiet.days.slice(0, 1);
  s.history.weeks.site = quiet.weeks.slice(0, 1);
  s.history.days.api = quiet.days;
  s.history.weeks.api = quiet.weeks;
  s.incidents = OLD_INCIDENTS(now);
  s.shares = shares(now, [[30, 1]], [[20, 1]]);

  switch (name) {
    case 'all-good':
      return s;

    case 'api-down': {
      const since = now - 70 * MIN;
      s.now.api = {
        state: 'down',
        checked_at: s.generated_at,
        failed: ['api_recent'],
        stale: false,
      };
      const down: Segment = { kind: 'down', start: since, end: null, failed: ['api_recent'] };
      s.last48h.api = [
        {
          kind: 'down',
          start: now - 35 * HOUR,
          end: now - 35 * HOUR + 15 * MIN,
          failed: ['api_entry'],
        },
        down,
      ];
      s.incidents = [inc(9, ['api'], 70 * MIN, null, now, ['api_recent']), ...s.incidents];
      s.uptime.api = {
        h24: win(95.83, 60, 1),
        d7: win(99.25, 75, 2),
        d30: win(99.75, 105, 3),
        d365: win(99.96, 180, 6),
        all: win(99.97, 180, 6),
      };
      const h = history(now, [
        [45, 15, 1],
        [12, 30, 1],
        [1, 15, 1],
        [0, 60, 1],
      ]);
      s.history.days.api = h.days;
      s.history.weeks.api = h.weeks;
      s.shares = shares(
        now,
        [[30, 1]],
        [
          [1, 4],
          [0, 7],
        ],
      );
      return s;
    }

    case 'both-down': {
      const since = now - 50 * MIN;
      for (const c of ['site', 'api'] as const) {
        s.now[c] = { state: 'down', checked_at: s.generated_at, failed: ['photo'], stale: false };
        s.last48h[c] = [{ kind: 'down', start: since, end: null, failed: ['photo'] }];
      }
      s.incidents = [inc(9, ['site', 'api'], 50 * MIN, null, now, ['photo']), ...s.incidents];
      return s;
    }

    case 'unknown': {
      const last = now - 4 * HOUR;
      s.generated_at = last;
      s.next_refresh_at = last + 15 * MIN + 90_000;
      for (const c of ['site', 'api'] as const) {
        s.now[c] = { state: 'unknown', checked_at: last, failed: [], stale: true };
        s.last48h[c] = [
          { kind: 'nodata', start: now - 30 * HOUR, end: now - 29 * HOUR },
          { kind: 'nodata', start: last + 15 * MIN, end: now },
        ];
      }
      return s;
    }

    case 'stale': {
      // Newest data older than two sampling intervals, as the client sees it when the cron stalls.
      const last = now - 50 * MIN;
      s.generated_at = last;
      s.next_refresh_at = last + 15 * MIN + 90_000;
      return s;
    }

    case 'busy': {
      const h = history(now, [
        [88, 15, 1],
        [78, 15, 1],
        [66, 45, 1],
        [60, 15, 1],
        [52, 195, 2],
        [45, 15, 1],
        [37, 570, 3],
        [31, 15, 1],
        [24, 255, 1],
        [16, 30, 1],
        [9, 15, 1],
        [3, 60, 1],
        [1, 45, 1],
      ]);
      s.history.days.site = h.days;
      s.history.weeks.site = h.weeks;
      const a = history(now, [
        [75, 15, 1],
        [33, 0, 0, 120],
        [58, 30, 1],
        [37, 570, 2],
        [20, 15, 1],
        [6, 30, 1],
        [2, 45, 1],
      ]);
      s.history.days.api = a.days;
      s.history.weeks.api = a.weeks;
      s.last48h.site = [
        {
          kind: 'down',
          start: now - 30 * HOUR,
          end: now - 29.25 * HOUR,
          failed: ['website_browse'],
        },
        { kind: 'down', start: now - 12 * HOUR, end: now - 11.5 * HOUR, failed: ['website_entry'] },
      ];
      s.last48h.api = [
        { kind: 'down', start: now - 40 * HOUR, end: now - 39.5 * HOUR, failed: ['api_recent'] },
        { kind: 'nodata', start: now - 20 * HOUR, end: now - 19 * HOUR },
      ];
      s.incidents = [
        inc(12, ['site'], 30 * HOUR, 29.25 * HOUR, now, ['website_browse']),
        inc(11, ['site', 'api'], 5 * DAY + 3 * HOUR, 5 * DAY + 2.75 * HOUR, now, ['photo']),
        inc(10, ['api'], 40 * HOUR, 39.5 * HOUR, now, ['api_recent']),
        ...OLD_INCIDENTS(now),
      ];
      s.uptime.site = {
        h24: win(100, 0, 0),
        d7: win(99.55, 45, 1),
        d30: win(99.34, 285, 5),
        d365: win(99.8, 1020, 13),
        all: win(99.86, 1140, 14),
      };
      // People shared problems on a day when our checks found nothing.
      s.shares = shares(
        now,
        [
          [40, 2],
          [30, 6],
          [12, 3],
          [11, 1],
        ],
        [
          [22, 1],
          [5, 2],
        ],
      );
      s.shares.days.site = [
        [day(now - 15 * DAY), 5],
        [day(now - 90 * DAY), 3],
      ];
      s.shares.weeks.site = [
        [monday(day(now - 15 * DAY)), 5],
        [monday(day(now - 90 * DAY)), 3],
      ];
      return s;
    }

    case 'new': {
      const started = now - 3 * HOUR;
      s.monitoring_since = started;
      s.history = {
        first_day: day(started),
        days: { site: [], api: [] },
        weeks: { site: [], api: [] },
      };
      s.uptime = {
        site: {
          h24: win(100, 0, 0),
          d7: win(100, 0, 0),
          d30: win(100, 0, 0),
          d365: win(100, 0, 0),
          all: win(100, 0, 0),
        },
        api: {
          h24: win(100, 0, 0),
          d7: win(100, 0, 0),
          d30: win(100, 0, 0),
          d365: win(100, 0, 0),
          all: win(100, 0, 0),
        },
      };
      s.incidents = [];
      delete s.shares;
      return s;
    }
  }
}
