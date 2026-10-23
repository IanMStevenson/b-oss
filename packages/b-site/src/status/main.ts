// The status page's client script. It makes ONE request for the data on load (the snapshot
// holds everything the page draws), then nothing: no timers, no auto-refresh. The Refresh link only
// goes to the network once the snapshot says fresher data can exist (`next_refresh_at`), and backs
// off if the monitor is late. Range buttons, "Show more" and the pop-ups all use the loaded data.

import { dayOf } from './dayutil';
import { h, setChildren } from './dom';
import { renderHistory, RANGES, type Range } from './history';
import { renderLanes } from './lanes';
import {
  afterFetch,
  initialRefresh,
  nextAllowedFetch,
  timeOf,
  updatedLabel,
  type RefreshState,
} from './logic';
import { renderNow } from './now';
import { initShare } from './share';
import { INCIDENT_PAGE, renderIncidents, renderUptime } from './tables';
import type { StatusSnapshot } from './types';

const DEFAULT_URL = 'https://b-status.b-oss.workers.dev/v1/status';
const STATUS_URL: string = import.meta.env.PUBLIC_STATUS_URL || DEFAULT_URL;
const SHARES_URL = `${new URL(STATUS_URL).origin}/v1/shares`;
const SITE_KEY: string = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || '';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`status page: missing ${sel}`);
  return el;
};

let snap: StatusSnapshot | null = null;
let failedToLoad = false;
let refresh: RefreshState = initialRefresh;
let range: Range = '90';
let shown = INCIDENT_PAGE;
let note = '';
let busy = false;

const mobileQuery = window.matchMedia('(max-width: 639px)');

function footer(): HTMLElement {
  const link = h(
    'button',
    { type: 'button', class: 'st-refresh' },
    failedToLoad ? 'Try again' : 'Refresh',
  );
  link.addEventListener('click', () => {
    void load(true);
  });
  return h(
    'div',
    { class: 'st-now-foot' },
    h(
      'span',
      { class: 'st-sub' },
      snap
        ? (failedToLoad ? 'Last updated ' : 'Updated ') + updatedLabel(snap.generated_at)
        : 'Loading…',
      ' ',
      busy ? h('span', { class: 'st-sub' }, 'Checking…') : link,
      note ? h('span', { class: 'st-note', role: 'status' }, ` ${note}`) : null,
    ),
    h('a', { href: '#share', class: 'st-trouble' }, 'Having trouble? Share a problem ↓'),
  );
}

function renderAll(): void {
  const now = Date.now();
  const nowHost = $('[data-now]');
  if (!snap) {
    setChildren(
      nowHost,
      failedToLoad
        ? h(
            'div',
            { class: 'st-headline st-headline-error' },
            h('span', { class: 'st-icon st-icon-error', 'aria-hidden': 'true' }, '!'),
            h(
              'div',
              {},
              h('h2', { id: 'st-now-title' }, 'Couldn’t load the current status'),
              h(
                'p',
                {},
                'We couldn’t reach the monitor just now. That doesn’t mean Blipfoto is down. Nothing is shown as working, because we don’t know.',
              ),
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
  $('[data-collecting]').textContent = '';
  const since = snap.monitoring_since;
  if (since !== null && since > snap.last48h.from) {
    $('[data-collecting]').textContent =
      `Started checking at ${timeOf(since)} ${dayOf(since) === dayOf(Date.now()) ? 'today' : ''}. Earlier time is shown blank.`.replace(
        ' .',
        '.',
      );
  }
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
  renderHistory($('[data-history]'), snap, range, dayOf(Date.now()));
}

async function load(manual: boolean): Promise<void> {
  if (busy) return;
  const now = Date.now();
  const wait = manual ? nextAllowedFetch(now, snap?.next_refresh_at ?? null, refresh) : null;
  if (wait !== null) {
    const backoff = refresh.notBefore > (snap?.next_refresh_at ?? 0);
    note = backoff
      ? `Nothing newer yet. Try again after about ${timeOf(wait)}.`
      : `Next check due about ${timeOf(wait)}.`;
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
    const fresh = !snap || next.generated_at !== snap.generated_at;
    refresh = afterFetch(Date.now(), refresh, { ok: true, fresh });
    snap = next;
    failedToLoad = false;
    if (!fresh && manual) note = 'Nothing newer yet.';
  } catch {
    refresh = afterFetch(Date.now(), refresh, { ok: false });
    failedToLoad = true;
  }
  busy = false;
  renderAll();
}

function initRanges(): void {
  const host = $('[data-ranges]');
  const buttons = RANGES.map((r) => {
    const b = h(
      'button',
      { type: 'button', class: 'st-range', 'aria-pressed': r.id === range },
      r.label,
    );
    b.addEventListener('click', () => {
      range = r.id;
      for (const [i, x] of buttons.entries())
        x.setAttribute('aria-pressed', String(RANGES[i]?.id === range));
      if (snap) renderHistory($('[data-history]'), snap, range, dayOf(Date.now()));
    });
    return b;
  });
  setChildren(host, ...buttons);
}

function start(): void {
  initRanges();
  initShare($('[data-share]'), { endpoint: SHARES_URL, siteKey: SITE_KEY });
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
    if (import.meta.env.DEV) {
      // `?fixture=<name>` in `npm run dev` only: preview any state without a monitor.
      const name = new URLSearchParams(location.search).get('fixture');
      const { FIXTURE_NAMES, makeFixture } = await import('./fixtures');
      const found = FIXTURE_NAMES.find((n) => n === name);
      if (found) {
        snap = makeFixture(found, Date.now());
        refresh = afterFetch(Date.now(), initialRefresh, { ok: true, fresh: true });
        renderAll();
        return;
      }
    }
    await load(false);
  })();
}

start();
