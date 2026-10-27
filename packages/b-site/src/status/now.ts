// The status banner: one solid block with the state and one short line, then Site and API as
// compact rows that carry their own state. The "last checked · Refresh" line is passed in (main.ts).

import { h } from './dom';
import {
  agoLabel,
  componentName,
  isStale,
  overallOf,
  timeOf,
  updatedLabel,
  whenLabel,
  type Overall,
} from './logic';
import type { Component, StatusSnapshot } from './types';

const ROLE: Record<Component, string> = {
  site: 'the website',
  api: 'what apps use',
};

type Kind = 'up' | 'down' | 'unknown' | 'error';

function icon(kind: Kind): HTMLElement {
  const glyph = { up: '✓', down: '✕', unknown: '?', error: '!' }[kind];
  return h('span', { class: `st-icon st-icon-${kind}`, 'aria-hidden': 'true' }, glyph);
}

function badge(state: 'up' | 'down' | 'unknown'): HTMLElement {
  const text = { up: 'Up', down: 'Down', unknown: 'Unknown' }[state];
  const glyph = { up: '✓', down: '✕', unknown: '?' }[state];
  return h(
    'span',
    { class: `st-badge st-badge-${state}` },
    h('span', { 'aria-hidden': 'true' }, glyph),
    ' ',
    text,
  );
}

/** "since about 14:00" (or with the day, when it wasn't today), or null if not currently down. */
function sinceLabel(snap: StatusSnapshot, c: Component, now: number): string | null {
  const open = snap.incidents.find((i) => i.ended_at === null && i.components.includes(c));
  if (!open) return null;
  const when = whenLabel(open.started_at, now);
  return `since about ${when.startsWith('Today, ') ? when.slice(7) : when}`;
}

export interface Text {
  title: string;
  body: string;
  kind: Kind;
}

/** The banner's state and its one short line. */
export function headline(
  snap: StatusSnapshot,
  now: number,
  overall: Overall,
  failedToLoad: boolean,
): Text {
  if (failedToLoad) {
    return {
      kind: 'error',
      title: 'Couldn’t load the status',
      body: `That doesn’t mean Blipfoto is down. Showing the last data we have, from ${updatedLabel(snap.generated_at)}.`,
    };
  }
  const since = (c: Component) => {
    const s = sinceLabel(snap, c, now);
    return s ? ` Down ${s}.` : '';
  };
  switch (overall) {
    case 'working':
      return { kind: 'up', title: 'Blipfoto is working', body: 'Site and API are both up.' };
    case 'api-down':
      return {
        kind: 'down',
        title: 'The API is down',
        body: `Apps such as b-ark and b-mobile may not connect. The Site is up.${since('api')}`,
      };
    case 'site-down':
      return {
        kind: 'down',
        title: 'The Site is down',
        body: `The API is up, so apps should still connect.${since('site')}`,
      };
    case 'photos':
      return {
        kind: 'down',
        title: 'Photos aren’t loading',
        body: `Site and API both show as down because of it: one cause, not two.${since('site')}`,
      };
    case 'both-down':
      return {
        kind: 'down',
        title: 'Site and API are down',
        body: since('site').trim() || 'Both are down.',
      };
    case 'partly-unknown':
      return {
        kind: 'unknown',
        title: 'Part of the status is unknown',
        body: 'We have no recent data for one part. The other part is up.',
      };
    case 'unknown': {
      const last = snap.now.site.checked_at ?? snap.now.api.checked_at;
      return {
        kind: 'unknown',
        title: 'Status unknown',
        body: `No data${last ? ` since ${timeOf(last)}` : ''}. That’s the monitor’s fault, not necessarily Blipfoto’s.`,
      };
    }
  }
}

/** The most recent check across both parts. */
export function lastCheckedAt(snap: StatusSnapshot): number | null {
  const times = [snap.now.site.checked_at, snap.now.api.checked_at].filter(
    (t): t is number => t !== null,
  );
  return times.length === 0 ? null : Math.max(...times);
}

/** "Last checked 6 minutes ago" (or "Not checked yet"). */
export function lastCheckedText(snap: StatusSnapshot, now: number): string {
  const t = lastCheckedAt(snap);
  return t === null ? 'Not checked yet' : `Last checked ${agoLabel(t, now)}`;
}

function part(snap: StatusSnapshot, c: Component, stale: boolean): HTMLElement {
  const state = stale ? 'unknown' : snap.now[c].state;
  return h(
    'li',
    { class: `st-part st-part-${state}` },
    h('span', { class: 'st-part-name' }, h('strong', {}, componentName(c)), h('span', {}, ROLE[c])),
    badge(state),
  );
}

export function renderNow(
  snap: StatusSnapshot,
  now: number,
  failedToLoad: boolean,
  footer: HTMLElement,
): HTMLElement[] {
  const stale = isStale(snap, now);
  const t = headline(snap, now, overallOf(snap, now), failedToLoad);
  return [
    h(
      'div',
      { class: `st-banner-main st-banner-main-${t.kind}` },
      icon(t.kind),
      h('div', {}, h('h2', { id: 'st-now-title' }, t.title), h('p', {}, t.body)),
    ),
    h(
      'ul',
      { class: 'st-parts', 'aria-label': 'Site and API' },
      part(snap, 'site', stale),
      part(snap, 'api', stale),
    ),
    footer,
  ];
}

/** The banner's colour treatment for the current state. */
export function bannerKind(
  snap: StatusSnapshot | null,
  now: number,
  failedToLoad: boolean,
): Kind | 'loading' {
  if (!snap) return failedToLoad ? 'error' : 'loading';
  return headline(snap, now, overallOf(snap, now), failedToLoad).kind;
}
