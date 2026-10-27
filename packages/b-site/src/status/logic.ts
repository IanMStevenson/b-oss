// Pure logic for the status page: formatting, refresh gating, and the maths that turns snapshot
// data into chart geometry. No DOM, so it is unit-tested (logic.test.ts).

import type {
  CheckId,
  Component,
  HistoryEntry,
  Segment,
  State,
  SnapshotIncident,
  StatusSnapshot,
  UptimeKey,
  UptimeWindow,
} from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** Segments are never drawn narrower than this, so one 15-minute sample is always visible. */
export const MIN_BLOCK_PX = 6;
/** History bars are drawn on an absolute scale with this ceiling (minutes of downtime per day). */
export const HISTORY_CEILING_MIN = 240;
export const HISTORY_MIN_BAR_PX = 3;

// ---------- Time formatting (UK time of day; history days are UTC days) ----------

const uk = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...opts });
const fmtTime = uk({ hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDay = uk({ weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayOnly = uk({ day: 'numeric', month: 'short' });
const fmtLong = uk({ day: 'numeric', month: 'short', year: 'numeric' });
const fmtParts = uk({ year: 'numeric', month: '2-digit', day: '2-digit' });

export const timeOf = (ts: number): string => fmtTime.format(ts);
// Some ICU versions write September as "Sept"; the page uses the three-letter form throughout.
const tidy = (s: string): string => s.replace(',', '').replace('Sept', 'Sep');
export const dayLabel = (ts: number): string => tidy(fmtDay.format(ts));
export const longDate = (ts: number): string => tidy(fmtLong.format(ts));

const ukDateKey = (ts: number): string => {
  const p = Object.fromEntries(fmtParts.formatToParts(ts).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

/** "14:00", "Today, 14:00", "Yesterday, 03:15" or "Sat 10 Oct, 09:15" (UK time). */
export function whenLabel(ts: number, now: number): string {
  const key = ukDateKey(ts);
  if (key === ukDateKey(now)) return `Today, ${timeOf(ts)}`;
  if (key === ukDateKey(now - DAY)) return `Yesterday, ${timeOf(ts)}`;
  return `${dayLabel(ts)}, ${timeOf(ts)}`;
}

/** "14:51, Thu 22 Oct" */
export const updatedLabel = (ts: number): string => `${timeOf(ts)}, ${dayLabel(ts)}`;

/** A UTC 'YYYY-MM-DD' as "Wed 7 Oct" (the day itself, whatever the viewer's zone). */
export function utcDayLabel(day: string): string {
  return tidy(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(Date.parse(`${day}T00:00:00Z`)),
  );
}

export function utcDayShort(day: string): string {
  return fmtDayOnly.format(Date.parse(`${day}T12:00:00Z`));
}

/** 15 -> "15 min", 105 -> "1 h 45 min", 180 -> "3 h". */
export function durationLabel(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** "About 15 min" (durations are quantised to the 15-minute sampling interval). */
export const aboutDuration = (minutes: number): string => `About ${durationLabel(minutes)}`;

/** How many consecutive 15-minute checks an outage covers: its span over the sampling interval,
 * counting the opening check (an open outage runs to the last check we have). */
export function failedCheckCount(start: number, end: number | null, lastCheck: number): number {
  const span = (end ?? lastCheck) - start;
  return Math.max(1, Math.round(span / (15 * MINUTE)) + (end === null ? 1 : 0));
}

/** "1 failed check", "4 failed checks": minutes of downtime counted in 15-minute samples. Used where
 * several outages are summed, where a duration would claim more precision than one reading gives. */
export function failedChecksLabel(minutes: number): string {
  const n = Math.max(1, Math.round(minutes / 15));
  return `${n} failed check${n === 1 ? '' : 's'}`;
}

/** What to say about how long an outage lasted. Checks are 15 minutes apart, so n failed checks in a
 * row mean real downtime between (n-1) and (n+1) intervals: one check is no duration at all, two or
 * three are a floor ("More than 15 min"), and from four the spread is small enough for "About". */
export function outageLength(n: number, start: number, ongoing: boolean): string {
  if (n <= 1) return `Failed 1 check, at ${timeOf(start)}`;
  if (n <= 3) return `More than ${(n - 1) * 15} min`;
  return `${aboutDuration(n * 15)}${ongoing ? ' so far' : ''}`;
}

/** The one place a percentage is formatted. The server sends uptime already floored to 3 decimals.
 * One decimal, always rounded DOWN ("99.4%", "98.0%"); figures in the 99.9x range show up to three
 * decimals with trailing zeros trimmed ("99.9%", "99.95%", "99.999%") so a figure that isn't perfect
 * never reads as 100%. Only an exact 100 shows "100%". null = no data. */
export function uptimeLabel(pct: number | null): string {
  if (pct === null) return 'No data yet';
  if (pct >= 100) return '100%';
  // Integer thousandths, floored (the epsilon absorbs float error, e.g. 99.428 * 1000), capped
  // below 100 so 99.9999 can never become "100%".
  const n = Math.min(99_999, Math.floor(Math.max(0, pct) * 1000 + 1e-6));
  const floor1 = Math.floor(n / 100) / 10;
  if (floor1 >= 99.9) return `${n / 1000}%`;
  return `${floor1.toFixed(1)}%`;
}

/** Uptime rows worth showing yet: 24 hours and all time always; 7 days, 30 days and a year only
 * once monitoring has lasted that long (snapshot `generated_at` minus `monitoring_since`). */
export function visibleUptimeKeys(
  generatedAt: number,
  monitoringSince: number | null,
): UptimeKey[] {
  const keys: UptimeKey[] = ['h24'];
  const lasted = monitoringSince === null ? -1 : generatedAt - monitoringSince;
  if (lasted >= 7 * DAY) keys.push('d7');
  if (lasted >= 30 * DAY) keys.push('d30');
  if (lasted >= 365 * DAY) keys.push('d365');
  keys.push('all');
  return keys;
}

export function windowDetail(w: UptimeWindow): string {
  if (w.uptime === null) return 'Not enough data yet';
  // 100% already says "no downtime"; only spell out downtime when there is some.
  if (w.down_minutes === 0 && w.incidents === 0) return '';
  const inc = `${w.incidents} incident${w.incidents === 1 ? '' : 's'}`;
  return `${failedChecksLabel(w.down_minutes)} · ${inc}`;
}

/** "6 minutes ago", "about 4 hours ago". */
export function agoLabel(ts: number, now: number): string {
  const min = Math.max(0, Math.round((now - ts) / MINUTE));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `about ${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `about ${d} days ago`;
}

// ---------- Refresh (no timers: the button only fetches when pressed, and not too often) ----------

/** A manual refresh may hit the network once this long after the last fetch. Data can change
 * between probes (shared problems), so this floor, not `next_refresh_at`, is what limits requests;
 * `next_refresh_at` is not shown; the stale rule uses `generated_at`. */
export const REFRESH_FLOOR_MS = 60_000;

/** The earliest moment a manual refresh may hit the network, or null if it may now. */
export function nextAllowedFetch(now: number, lastFetchAt: number | null): number | null {
  if (lastFetchAt === null) return null;
  const due = lastFetchAt + REFRESH_FLOOR_MS;
  return now >= due ? null : due;
}

/** True when a refetch brought nothing new: the same snapshot, the same share counts and the same
 * "last checked" times (a report-triggered check moves those without a new `generated_at`). */
export function snapshotUnchanged(prev: StatusSnapshot, next: StatusSnapshot): boolean {
  return (
    prev.generated_at === next.generated_at &&
    prev.now.site.checked_at === next.now.site.checked_at &&
    prev.now.api.checked_at === next.now.api.checked_at &&
    JSON.stringify(prev.shares ?? null) === JSON.stringify(next.shares ?? null)
  );
}

/** Older than two sampling intervals: the monitor has no recent data. */
export function isStale(snap: StatusSnapshot, now: number): boolean {
  return now - snap.generated_at > 2 * snap.definition.sample_interval_minutes * MINUTE;
}

// ---------- Headline and incidents ----------

/** The overall situation, from the two parts' states. The banner's colour follows the WEBSITE (it
 * affects everyone); the API only changes the wording and its own row. */
export type Overall =
  | 'working'
  | 'api-down' // website working, API not: still a green banner
  | 'api-unknown' // website working, can't tell about the API
  | 'site-down'
  | 'site-down-api-unknown'
  | 'both-down'
  | 'photos' // both not working because photos aren't loading
  | 'site-unknown' // can't tell about the website (the API is known)
  | 'cant-tell'; // can't tell about either (no recent data, or the snapshot is stale)

/** A part's state for display: stale data can't be vouched for, so it is Unknown. */
export function effectiveState(snap: StatusSnapshot, c: Component, now: number): State {
  return isStale(snap, now) ? 'unknown' : snap.now[c].state;
}

export function overallOf(snap: StatusSnapshot, now: number): Overall {
  const s = effectiveState(snap, 'site', now);
  const a = effectiveState(snap, 'api', now);
  if (s === 'unknown' && a === 'unknown') return 'cant-tell';
  if (s === 'unknown') return 'site-unknown';
  if (s === 'down') {
    if (a === 'unknown') return 'site-down-api-unknown';
    if (a === 'down') {
      const photos =
        snap.now.site.failed.includes('photo') && snap.now.api.failed.includes('photo');
      return photos ? 'photos' : 'both-down';
    }
    return 'site-down';
  }
  if (a === 'down') return 'api-down';
  if (a === 'unknown') return 'api-unknown';
  return 'working';
}

const CHECK_PLAIN: Record<CheckId, string> = {
  website_browse: 'website not responding',
  website_entry: 'website returning errors',
  photo: 'photos not loading',
  api_recent: 'API not responding',
  api_entry: 'API returning errors',
};

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "Website not responding", "Photos not loading"… from the failing checks. */
export function incidentTitle(i: Pick<SnapshotIncident, 'components' | 'failed'>): string {
  if (i.failed.includes('photo')) return 'Photos not loading';
  const first = i.failed[0];
  if (first && i.components.length === 1) return capital(CHECK_PLAIN[first]);
  if (i.components.length === 2) return 'Website and API not responding';
  return i.components[0] === 'api' ? 'API not responding' : 'Website not responding';
}

export const componentName = (c: Component): string => (c === 'site' ? 'Website' : 'API');
/** Mid-sentence form: "the website" / "the API". */
export const componentThe = (c: Component): string => (c === 'site' ? 'the website' : 'the API');
export const componentLabel = (cs: Component[]): string =>
  cs.length === 2 ? 'Website and API' : componentName(cs[0] ?? 'site');

// ---------- Chart geometry ----------

export interface Block {
  kind: 'down' | 'nodata';
  /** Pixel x and width within the track. */
  x: number;
  w: number;
  segment: Segment;
  ongoing: boolean;
}

/** Map time segments onto a track `width` px wide covering [from, to]. Blocks are at least
 * MIN_BLOCK_PX wide, and an ongoing outage ends exactly at the right edge ("Now"). */
export function laneBlocks(
  segments: Segment[],
  from: number,
  to: number,
  width: number,
  minPx = MIN_BLOCK_PX,
): Block[] {
  const span = to - from;
  if (span <= 0 || width <= 0) return [];
  const px = (t: number) => ((Math.min(Math.max(t, from), to) - from) / span) * width;
  const out: Block[] = [];
  for (const seg of segments) {
    const ongoing = seg.end === null;
    const endT = seg.end ?? to;
    if (endT <= from || seg.start > to) continue;
    const x0 = px(seg.start);
    const x1 = px(endT);
    const w = Math.max(minPx, x1 - x0);
    // Keep a minimum-width block inside the track, flush right when it would overflow.
    const x = ongoing || x0 + w > width ? Math.max(0, width - w) : x0;
    out.push({ kind: seg.kind, x, w: Math.min(w, width), segment: seg, ongoing });
  }
  return out;
}

export interface Tick {
  x: number;
  ts: number;
  /** Midnight (UK) boundary. */
  day: boolean;
  /** Label to draw, if any. */
  label?: string;
}

/** Hourly ticks across the window, labelled every `labelEvery` hours, with day boundaries marked. */
export function laneTicks(from: number, to: number, width: number, labelEvery: number): Tick[] {
  const out: Tick[] = [];
  const first = Math.ceil(from / HOUR) * HOUR;
  for (let t = first; t <= to; t += HOUR) {
    const time = timeOf(t);
    const midnight = time === '00:00';
    const hour = Number(time.slice(0, 2));
    const labelled = hour % labelEvery === 0;
    out.push({
      x: ((t - from) / (to - from)) * width,
      ts: t,
      day: midnight,
      label: midnight ? dayLabel(t) : labelled ? time : undefined,
    });
  }
  return out;
}

export interface Bar {
  index: number;
  /** Slot centre x. */
  x: number;
  w: number;
  /** Bar height in px (0 when there is no downtime). */
  h: number;
  minutes: number;
  clipped: boolean;
  entry?: HistoryEntry;
  key: string;
}

/** The ordered column keys ('YYYY-MM-DD' UTC days): the last `days` days, ending today. */
export function columnKeys(days: number, today: string): string[] {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--)
    keys.push(new Date(todayMs - i * DAY).toISOString().slice(0, 10));
  return keys;
}

/** Bars for each column: height is minutes down on an absolute scale with a 4-hour ceiling, a
 * 3 px minimum for any downtime, and `clipped` (drawn full height) above the ceiling. */
export function historyBars(
  keys: string[],
  entries: HistoryEntry[],
  width: number,
  chartHeight: number,
  minBarPx = 2,
  maxBarPx = 18,
): Bar[] {
  if (keys.length === 0 || width <= 0) return [];
  const byKey = new Map(entries.map((e) => [e[0], e]));
  const slot = width / keys.length;
  const w = Math.min(maxBarPx, Math.max(minBarPx, slot * 0.7));
  return keys.map((key, index) => {
    const entry = byKey.get(key);
    const minutes = entry?.[1] ?? 0;
    const h =
      minutes <= 0
        ? 0
        : Math.max(
            HISTORY_MIN_BAR_PX,
            (Math.min(minutes, HISTORY_CEILING_MIN) / HISTORY_CEILING_MIN) * chartHeight,
          );
    return {
      index,
      x: index * slot + slot / 2,
      w,
      h,
      minutes,
      clipped: minutes > HISTORY_CEILING_MIN,
      entry,
      key,
    };
  });
}

/** Scale for a Shared lane: bars are relative to max(5, busiest slot). */
export const sharedScale = (counts: number[]): number => Math.max(5, ...counts, 0);
