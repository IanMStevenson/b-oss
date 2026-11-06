// The status page's client script. It fetches the snapshot on load (it holds everything the page
// draws). While the tab is visible it then redraws from that snapshot every 30 s (no request, so the
// "N minutes ago" and the stale rule keep up) and fetches once more at the snapshot's
// `next_refresh_at` plus a little jitter, retrying with a back-off on failure. A hidden tab does
// nothing; becoming visible redraws and refetches if that time has passed. Fixture previews never
// fetch. The Refresh button may fetch again once 60 seconds have passed since the last fetch (data
// can change between probes, because of shared problems). A successful share's response carries the updated share counts, which
// replace the loaded ones so the poster sees their share straight away, with no refetch. "Show more"
// and the pop-ups all use the loaded data.

import { dayOf } from './dayutil';
import { h, s, setChildren } from './dom';
import { renderHistory } from './history';
import { renderLanes } from './lanes';
import {
  isStale,
  MINUTE,
  nextAllowedFetch,
  nextAutoFetchAt,
  REFETCH_JITTER_MS,
  sinceLabel,
  snapshotUnchanged,
  TICK_MS,
  updatedLabel,
} from './logic';
import { bannerKind, lastCheckedText, renderNow, renderUnavailable } from './now';
import { initShare } from './share';
import { INCIDENT_PAGE, renderIncidents, renderUptime } from './tables';
import type { StatusSnapshot } from './types';

/** A fetch that takes longer than this is abandoned (and counts as a failure). */
const FETCH_TIMEOUT_MS = 15_000;
/** Wake-ups (focus, online, ...) fetch at most this often, so a flurry of events is one request. */
const WAKE_GAP_MS = 5_000;
const DEFAULT_URL = 'https://b-status.b-oss.workers.dev/v1/status';

/** Settings handed in by the page (status.astro reads the build-time PUBLIC_* variables, so no
 * .ts file here touches import.meta.env). */
export interface StatusOptions {
  /** Snapshot endpoint; empty = the default workers.dev URL. */
  statusUrl: string;
  /** Cloudflare Turnstile site key; empty = placeholder box. */
  turnstileKey: string;
  /** Dev builds only: loads the fixture snapshots for `?fixture=<name>`. Absent in production, so
   * the fixtures are not part of the built site. */
  loadFixtures?: () => Promise<typeof import('./fixtures')>;
  /** Which fixture to show (the standalone preview sets this); defaults to the `?fixture=` query. */
  fixture?: string;
}

let STATUS_URL = DEFAULT_URL;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`status page: missing ${sel}`);
  return el;
};

let snap: StatusSnapshot | null = null;
let failedToLoad = false;
/** When the last fetch (successful or not) finished; the 60-second refresh floor counts from here. */
let lastFetchAt: number | null = null;
let shown = INCIDENT_PAGE;
let note = '';
let busy = false;
/** The in-flight fetch, so waking from a freeze can abandon one that will never settle. */
let inflight: AbortController | undefined;
let failures = 0;
/** True for a `?fixture=` preview: there is no service to poll. */
let fixtureMode = false;
let fetchTimer: ReturnType<typeof setTimeout> | undefined;
let tickTimer: ReturnType<typeof setInterval> | undefined;

const mobileQuery = window.matchMedia('(max-width: 639px)');

/** The standard circular-arrow refresh icon. */
function refreshIcon(): SVGElement {
  return s(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: 20,
      height: 20,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    s('path', { d: 'M20 12a8 8 0 1 1-2.34-5.66' }),
    s('path', { d: 'M20 4v5h-5' }),
  );
}

function footer(): HTMLElement {
  const now = Date.now();
  const label = 'Refresh';
  const link = h(
    'button',
    { type: 'button', class: 'st-refresh', 'aria-label': label, title: label },
    refreshIcon(),
  );
  link.addEventListener('click', () => {
    void load(true);
  });
  const left: (string | HTMLElement | null)[] = [];
  if (snap && !busy && pageAsleep(now)) {
    // The tab missed its fetches (frozen or discarded): say so, with a way out that always works.
    const reload = h('button', { type: 'button', class: 'st-reload' }, 'Reload');
    reload.addEventListener('click', () => location.reload());
    return h(
      'div',
      { class: 'st-banner-foot' },
      h('span', { class: 'st-foot-left' }, 'This page is out of date. ', reload),
      h('a', { href: 'how-this-works', class: 'st-howlink' }, 'How this works'),
    );
  }
  if (!snap) left.push(failedToLoad ? 'No data yet' : 'Loading…');
  else if (failedToLoad) left.push(`Last data from ${updatedLabel(snap.generated_at)}`);
  else left.push(lastCheckedText(snap, now));
  left.push(' ', busy ? 'Checking…' : link);
  return h(
    'div',
    { class: 'st-banner-foot' },
    h(
      'span',
      { class: 'st-foot-left' },
      ...left,
      note ? h('span', { class: 'st-note', role: 'status' }, note) : null,
    ),
    h('a', { href: 'how-this-works', class: 'st-howlink' }, 'How this works'),
  );
}

function renderAll(): void {
  const now = Date.now();
  const nowHost = $('[data-now]');
  nowHost.className = `st-banner st-banner-${bannerKind(snap, now, failedToLoad)}`;
  if (!snap) {
    if (failedToLoad) {
      setChildren(nowHost, ...renderUnavailable(footer()));
    } else {
      setChildren(
        nowHost,
        h(
          'div',
          {},
          h('h1', { id: 'st-now-title' }, 'The status of blipfoto'),
          h('p', { class: 'st-loading' }, 'Loading…'),
        ),
        footer(),
      );
    }
    return;
  }
  setChildren(nowHost, ...renderNow(snap, now, failedToLoad, footer()));
  renderCharts();
  renderUptime($('[data-uptime]'), snap);
  renderIncidentList();
  const since = snap.monitoring_since;
  $('[data-collecting]').textContent =
    since !== null && since > snap.last48h.from
      ? `Checking started ${sinceLabel(since, now)}; earlier time is blank.`
      : '';
}

function renderIncidentList(): void {
  if (!snap) return;
  renderIncidents($('[data-incidents]'), snap, Date.now(), shown, () => {
    shown += INCIDENT_PAGE;
    renderIncidentList();
  });
}

function renderCharts(): void {
  if (!snap) return;
  renderLanes($('[data-lanes]'), snap, Date.now(), mobileQuery.matches);
  renderHistory($('[data-history]'), snap, dayOf(Date.now()));
}

async function load(manual: boolean): Promise<void> {
  if (busy) return;
  const wait = manual ? nextAllowedFetch(Date.now(), lastFetchAt) : null;
  if (wait !== null) {
    note = 'Just refreshed';
    renderAll();
    return;
  }
  busy = true;
  note = '';
  renderAll();
  const mine = new AbortController();
  inflight = mine;
  const giveUp = setTimeout(() => mine.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(STATUS_URL, { credentials: 'omit', signal: mine.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = (await res.json()) as StatusSnapshot;
    if (next.version !== 1) throw new Error('unknown snapshot version');
    if (manual && snap && snapshotUnchanged(snap, next)) note = 'No change yet';
    snap = next;
    failedToLoad = false;
  } catch {
    failedToLoad = true;
  }
  clearTimeout(giveUp);
  if (inflight !== mine) return; // abandoned on wake; the newer fetch owns the state
  inflight = undefined;
  lastFetchAt = Date.now();
  failures = failedToLoad ? failures + 1 : 0;
  busy = false;
  renderAll();
  scheduleFetch();
}

/** (Re)arm the single automatic fetch; only while the tab is visible and the data is real. */
function scheduleFetch(): void {
  clearTimeout(fetchTimer);
  if (fixtureMode || document.hidden) return;
  const jitter = Math.random() * REFETCH_JITTER_MS;
  const at = nextAutoFetchAt(snap, lastFetchAt, failures, jitter);
  fetchTimer = setTimeout(() => void load(false), Math.max(0, at - Date.now()));
}

/** True when the page has gone without a fetch for two sampling intervals, i.e. it was asleep. */
function pageAsleep(now: number): boolean {
  return (
    !!snap &&
    lastFetchAt !== null &&
    now - lastFetchAt > 2 * snap.definition.sample_interval_minutes * MINUTE
  );
}

/** The tab came back (visible, restored from the back-forward cache, focused, or online again). A
 * fetch that was in flight when the tab froze may never settle, so abandon it; then fetch at once
 * if the data is old, ignoring the manual-refresh floor (a person is looking at the page). */
function wake(): void {
  if (fixtureMode || document.hidden) return;
  const now = Date.now();
  const old = failedToLoad || !snap || pageAsleep(now) || isStale(snap, now);
  if (busy && old) {
    inflight?.abort();
    inflight = undefined;
    busy = false;
  }
  if (!old || busy || (lastFetchAt !== null && now - lastFetchAt < WAKE_GAP_MS)) return;
  void load(false);
}

/** Visible: redraw every TICK_MS and keep the fetch armed. Hidden: both timers off. */
function syncVisibility(): void {
  clearInterval(tickTimer);
  clearTimeout(fetchTimer);
  if (fixtureMode || document.hidden) return;
  tickTimer = setInterval(() => {
    if (!busy) renderAll();
  }, TICK_MS);
  if (snap || failedToLoad) renderAll();
  scheduleFetch();
  wake();
}

export function start(opts: StatusOptions): void {
  STATUS_URL = opts.statusUrl || DEFAULT_URL;
  initShare($('[data-share]'), {
    endpoint: `${new URL(STATUS_URL).origin}/v1/shares`,
    siteKey: opts.turnstileKey,
  });
  renderAll();

  // Redraw the charts when the available width changes (they are drawn at real pixel sizes).
  let lastWidth = $('[data-lanes]').getBoundingClientRect().width;
  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const w = $('[data-lanes]').getBoundingClientRect().width;
      if (Math.abs(w - lastWidth) >= 1) {
        lastWidth = w;
        renderCharts();
      }
    });
  }).observe($('[data-lanes]'));
  mobileQuery.addEventListener('change', renderCharts);

  document.addEventListener('visibilitychange', syncVisibility);
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);

  void (async () => {
    if (opts.loadFixtures) {
      // `?fixture=<name>` in `npm run dev` only: preview any state without a monitor.
      const name = opts.fixture ?? new URLSearchParams(location.search).get('fixture');
      const { FIXTURE_NAMES, makeFixture } = await opts.loadFixtures();
      const found = FIXTURE_NAMES.find((n) => n === name);
      if (found) {
        fixtureMode = true;
        snap = makeFixture(found, Date.now());
        lastFetchAt = Date.now();
        renderAll();
        return;
      }
    }
    await load(false);
    syncVisibility();
  })();
}
