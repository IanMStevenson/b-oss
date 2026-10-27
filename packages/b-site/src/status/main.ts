// The status page's client script. It makes ONE request for the data on load (the snapshot
// holds everything the page draws), then nothing: no timers, no auto-refresh. The Refresh button
// may fetch again once 60 seconds have passed since the last fetch (data can change between probes,
// because of shared problems). A successful share's response carries the updated share counts, which
// replace the loaded ones so the poster sees their share straight away, with no refetch. "Show more"
// and the pop-ups all use the loaded data.

import { dayOf } from './dayutil';
import { h, setChildren } from './dom';
import { renderHistory } from './history';
import { renderLanes } from './lanes';
import { isStale, nextAllowedFetch, snapshotUnchanged, timeOf, withShares } from './logic';
import { bannerKind, lastCheckedText, renderNow } from './now';
import { initShare } from './share';
import { INCIDENT_PAGE, renderIncidents, renderUptime } from './tables';
import type { StatusSnapshot } from './types';

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

const mobileQuery = window.matchMedia('(max-width: 639px)');

function footer(): HTMLElement {
  const now = Date.now();
  const link = h(
    'button',
    { type: 'button', class: 'st-refresh' },
    failedToLoad ? 'Try again' : 'Refresh',
  );
  link.addEventListener('click', () => {
    void load(true);
  });
  const left: (string | HTMLElement | null)[] = [];
  if (!snap) left.push(failedToLoad ? 'No data yet' : 'Loading…');
  else if (failedToLoad) left.push('Couldn’t update');
  else left.push(lastCheckedText(snap, now));
  left.push(' · ', busy ? 'Checking…' : link);
  if (snap && !failedToLoad && !isStale(snap, now) && snap.next_refresh_at > now) {
    left.push(` · Next check about ${timeOf(snap.next_refresh_at)}`);
  }
  return h(
    'div',
    { class: 'st-banner-foot' },
    h(
      'span',
      {},
      ...left,
      note ? h('span', { class: 'st-note', role: 'status' }, ` ${note}`) : null,
    ),
    h('a', { href: '#share', class: 'st-trouble' }, 'Share a problem ↓'),
  );
}

function renderAll(): void {
  const now = Date.now();
  const nowHost = $('[data-now]');
  nowHost.className = `st-banner st-banner-${bannerKind(snap, now, failedToLoad)}`;
  if (!snap) {
    setChildren(
      nowHost,
      failedToLoad
        ? h(
            'div',
            { class: 'st-banner-main st-banner-main-error' },
            h('span', { class: 'st-icon st-icon-error', 'aria-hidden': 'true' }, '!'),
            h(
              'div',
              {},
              h('h2', { id: 'st-now-title' }, 'Couldn’t load the status'),
              h('p', {}, 'That doesn’t mean Blipfoto is down. We just don’t know.'),
            ),
          )
        : h('p', { class: 'st-loading' }, 'Loading current status…'),
      footer(),
    );
    return;
  }
  setChildren(nowHost, ...renderNow(snap, now, failedToLoad, footer()));
  renderCharts();
  renderUptime($('[data-uptime]'), snap);
  renderIncidentList();
  const since = snap.monitoring_since;
  $('[data-collecting]').textContent =
    since !== null && since > snap.last48h.from
      ? `Checking started at ${timeOf(since)}${dayOf(since) === dayOf(Date.now()) ? ' today' : ''}; earlier time is blank.`
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
    note = `Just refreshed; try again after about ${timeOf(wait)}.`;
    renderAll();
    return;
  }
  busy = true;
  note = '';
  renderAll();
  try {
    const res = await fetch(STATUS_URL, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = (await res.json()) as StatusSnapshot;
    if (next.version !== 1) throw new Error('unknown snapshot version');
    if (manual && snap && snapshotUnchanged(snap, next)) note = 'No change yet.';
    snap = next;
    failedToLoad = false;
  } catch {
    failedToLoad = true;
  }
  lastFetchAt = Date.now();
  busy = false;
  renderAll();
}

export function start(opts: StatusOptions): void {
  STATUS_URL = opts.statusUrl || DEFAULT_URL;
  initShare($('[data-share]'), {
    endpoint: `${new URL(STATUS_URL).origin}/v1/shares`,
    siteKey: opts.turnstileKey,
    // A share went through: swap in the updated counts and redraw the Shared lanes (only the
    // charts, so nothing else on the page moves), with no refetch.
    onShared: (shares) => {
      if (!snap) return;
      snap = withShares(snap, shares);
      renderCharts();
    },
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

  void (async () => {
    if (opts.loadFixtures) {
      // `?fixture=<name>` in `npm run dev` only: preview any state without a monitor.
      const name = opts.fixture ?? new URLSearchParams(location.search).get('fixture');
      const { FIXTURE_NAMES, makeFixture } = await opts.loadFixtures();
      const found = FIXTURE_NAMES.find((n) => n === name);
      if (found) {
        snap = makeFixture(found, Date.now());
        lastFetchAt = Date.now();
        renderAll();
        return;
      }
    }
    await load(false);
  })();
}
