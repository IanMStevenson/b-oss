// The status snapshot the page reads. Copied BY HAND from packages/b-status/src/snapshot.ts
// (packages never depend on each other): keep the two in step. `shares` is the optional field the
// shares endpoint (b-oss#486) adds; absent or empty means an empty "Shared" lane.

export type Component = 'site' | 'api';
export type State = 'up' | 'down' | 'unknown';
export type CheckId = 'website_browse' | 'website_entry' | 'photo' | 'api_recent' | 'api_entry';

/** [day or week-start (UTC), minutes down, incidents, minutes with no data] */
export type HistoryEntry = [string, number, number, number];

export interface Segment {
  kind: 'down' | 'nodata';
  start: number;
  /** null = still going (drawn flush to "now"). */
  end: number | null;
  failed?: CheckId[];
}

export interface UptimeWindow {
  /** Percent floored to 3 decimals; 100 only when nothing was found down; null = no data. */
  uptime: number | null;
  down_minutes: number;
  incidents: number;
}

export type UptimeKey = 'h24' | 'd7' | 'd30' | 'd365' | 'all';

export interface SnapshotIncident {
  id: number;
  components: Component[];
  started_at: number;
  ended_at: number | null;
  failed: CheckId[];
}

export interface Shares {
  /** [hour-start epoch ms, count], last 48 hours, non-empty hours only. */
  hours: Record<Component, [number, number][]>;
  /** [UTC 'YYYY-MM-DD', count], last 30 days, non-empty only. */
  days: Record<Component, [string, number][]>;
}

export interface StatusSnapshot {
  version: 1;
  generated_at: number;
  next_refresh_at: number;
  monitoring_since: number | null;
  definition: { sample_interval_minutes: number; uptime: string; days: string; windows: string };
  now: Record<
    Component,
    { state: State; checked_at: number | null; failed: CheckId[]; stale: boolean }
  >;
  last48h: { from: number; to: number } & Record<Component, Segment[]>;
  history: {
    first_day: string | null;
    /** The last 30 UTC days (ending today), non-empty days only; the page fills the gaps. */
    days: Record<Component, HistoryEntry[]>;
  };
  uptime: Record<Component, Record<UptimeKey, UptimeWindow>>;
  incidents: SnapshotIncident[];
  shares?: Shares;
}
