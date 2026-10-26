// Pure logic for the status page: formatting, refresh gating, and the maths that turns snapshot
// data into chart geometry. No DOM, so it is unit-tested (logic.test.ts).

import type {
  CheckId,
  Component,
  HistoryEntry,
  Segment,
  SnapshotIncident,
  StatusSnapshot,
  UptimeWindow,
} from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** Segments are never drawn narrower than this, so one 15-minute sample is always visible. */
export const MIN_BLOCK_PX = 6;
/** History bars are drawn on an absolute scale with this ceiling (minutes down per day). */
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

/** Uptime as drawn: "100%" or two decimals. The server already rounds down; never round again. */
export function uptimeLabel(pct: number | null): string {
  if (pct === null) return 'No data yet';
  return pct === 100 ? '100%' : `${pct.toFixed(2)}%`;
}

export function windowDetail(w: UptimeWindow): string {
  if (w.uptime === null) return 'Not enough data yet';
  if (w.down_minutes === 0 && w.incidents === 0) return 'No problems';
  const inc = `${w.incidents} incident${w.incidents === 1 ? '' : 's'}`;
  return `${durationLabel(w.down_minutes)} down · ${inc}`;
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

// ---------- Refresh gating (no timers: the link only fetches when allowed) ----------

export const BACKOFF_MS = [60_000, 120_000, 300_000] as const;

export interface RefreshState {
  /** Consecutive fetches that brought nothing new (or failed). */
  attempt: number;
  /** No request before this time (epoch ms). 0 = unrestricted. */
  notBefore: number;
}

export const initialRefresh: RefreshState = { attempt: 0, notBefore: 0 };

/** The earliest moment a refresh may hit the network, or null if it may now. */
export function nextAllowedFetch(
  now: number,
  nextRefreshAt: number | null,
  s: RefreshState,
): number | null {
  const due = Math.max(nextRefreshAt ?? 0, s.notBefore);
  return now >= due ? null : due;
}

/** State after a fetch: fresh data resets; the same `generated_at` (cron late) or a failure backs off. */
export function afterFetch(
  now: number,
  s: RefreshState,
  outcome: { ok: true; fresh: boolean } | { ok: false },
): RefreshState {
  if (outcome.ok && outcome.fresh) return { attempt: 0, notBefore: 0 };
  const attempt = s.attempt + 1;
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[2];
  return { attempt, notBefore: now + delay };
}

/** Older than two sampling intervals: the monitor has no recent data. */
export function isStale(snap: StatusSnapshot, now: number): boolean {
  return now - snap.generated_at > 2 * snap.definition.sample_interval_minutes * MINUTE;
}

// ---------- Headline and incidents ----------

export type Overall =
  'working' | 'site-down' | 'api-down' | 'both-down' | 'photos' | 'partly-unknown' | 'unknown';

export function overallOf(snap: StatusSnapshot, now: number): Overall {
  const stale = isStale(snap, now);
  const s = stale ? 'unknown' : snap.now.site.state;
  const a = stale ? 'unknown' : snap.now.api.state;
  if (s === 'unknown' && a === 'unknown') return 'unknown';
  if (s === 'down' && a === 'down') {
    const photos = snap.now.site.failed.includes('photo') && snap.now.api.failed.includes('photo');
    return photos ? 'photos' : 'both-down';
  }
  if (s === 'down') return 'site-down';
  if (a === 'down') return 'api-down';
  if (s === 'unknown' || a === 'unknown') return 'partly-unknown';
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

export const componentName = (c: Component): string => (c === 'site' ? 'Site' : 'API');
export const componentLabel = (cs: Component[]): string =>
  cs.length === 2 ? 'Site and API' : componentName(cs[0] ?? 'site');

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
    if (endT <= from || seg.start >= to) continue;
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

/** Summary line over a window: "99.98% over the last 30 days · 15 min down · 1 incident". */
export function windowSummary(words: string, w: UptimeWindow): string {
  if (w.uptime === null) return `No data yet for ${words}`;
  if (w.down_minutes === 0 && w.incidents === 0)
    return `${uptimeLabel(w.uptime)} over ${words} · no problems`;
  const inc = `${w.incidents} incident${w.incidents === 1 ? '' : 's'}`;
  return `${uptimeLabel(w.uptime)} over ${words} · ${durationLabel(w.down_minutes)} down · ${inc}`;
}
