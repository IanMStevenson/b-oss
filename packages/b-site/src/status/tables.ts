// The text versions of the charts: the uptime table and the incident list.

import { h, setChildren } from './dom';
import {
  aboutDuration,
  componentLabel,
  dayLabel,
  incidentTitle,
  longDate,
  timeOf,
  uptimeLabel,
  visibleUptimeKeys,
  whenLabel,
  windowDetail,
} from './logic';
import type { StatusSnapshot, UptimeKey } from './types';

const ROWS: { key: UptimeKey; label: string }[] = [
  { key: 'h24', label: 'Last 24 hours' },
  { key: 'd7', label: 'Last 7 days' },
  { key: 'd30', label: 'Last 30 days' },
  { key: 'd365', label: 'Last year' },
  { key: 'all', label: 'All time' },
];

export function renderUptime(host: HTMLElement, snap: StatusSnapshot): void {
  const cell = (c: 'site' | 'api', key: UptimeKey) => {
    const w = snap.uptime[c][key];
    const detail = windowDetail(w);
    return h(
      'td',
      {},
      h('strong', { class: 'st-pct' }, uptimeLabel(w.uptime)),
      detail ? h('span', { class: 'st-sub' }, detail) : null,
    );
  };
  const table = h(
    'table',
    { class: 'st-table' },
    h('caption', { class: 'st-sr' }, 'Uptime by period, for the website and the API'),
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col' }, 'Period'),
        h('th', { scope: 'col' }, 'Website'),
        h('th', { scope: 'col' }, 'API'),
      ),
    ),
    h(
      'tbody',
      {},
      ...ROWS.filter((r) =>
        visibleUptimeKeys(snap.generated_at, snap.monitoring_since).includes(r.key),
      ).map((r) =>
        h(
          'tr',
          {},
          h(
            'th',
            { scope: 'row' },
            r.label,
            r.key === 'all' && snap.monitoring_since
              ? h('span', { class: 'st-sub' }, `since ${longDate(snap.monitoring_since)}`)
              : null,
          ),
          cell('site', r.key),
          cell('api', r.key),
        ),
      ),
    ),
  );
  setChildren(host, table);
}

const PAGE = 5;

export function renderIncidents(
  host: HTMLElement,
  snap: StatusSnapshot,
  now: number,
  shown: number,
  onMore: () => void,
): void {
  if (snap.incidents.length === 0) {
    setChildren(host, h('p', { class: 'st-empty' }, 'No incidents recorded.'));
    return;
  }
  const items = snap.incidents.slice(0, shown).map((i) => {
    const end = i.ended_at;
    const ongoing = end === null;
    const when =
      end === null
        ? whenLabel(i.started_at, now)
        : `${whenLabel(i.started_at, now)} to ${dayLabel(end) === dayLabel(i.started_at) ? timeOf(end) : whenLabel(end, now)}`;
    const mins = Math.max(15, Math.round(((end ?? now) - i.started_at) / 60_000 / 15) * 15);
    return h(
      'li',
      { class: 'st-incident' },
      h(
        'div',
        { class: 'st-incident-main' },
        // Only a current incident is flagged: past ones are the default, so no "Resolved" on every row.
        h(
          'span',
          { class: 'st-incident-title' },
          ongoing ? h('span', { class: 'st-chip st-chip-ongoing' }, 'Ongoing') : null,
          h('strong', {}, incidentTitle(i)),
        ),
        h('span', { class: 'st-sub' }, `${componentLabel(i.components)} · ${when}`),
      ),
      h('span', { class: 'st-incident-dur' }, `${aboutDuration(mins)}${ongoing ? ' so far' : ''}`),
    );
  });
  const more = snap.incidents.length - shown;
  const btn =
    more > 0
      ? h(
          'button',
          { type: 'button', class: 'st-btn st-btn-quiet' },
          `Show ${Math.min(PAGE, more)} more`,
        )
      : null;
  btn?.addEventListener('click', onMore);
  setChildren(
    host,
    h('ol', { class: 'st-incidents' }, ...items),
    h(
      'div',
      { class: 'st-more' },
      btn,
      h(
        'span',
        { class: 'st-sub' },
        `Showing ${Math.min(shown, snap.incidents.length)} of ${snap.incidents.length} incidents`,
      ),
    ),
  );
}

export const INCIDENT_PAGE = PAGE;
