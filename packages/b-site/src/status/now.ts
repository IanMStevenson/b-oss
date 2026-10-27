// The status banner: one solid block with the state and one short line, then Site and API as
// compact rows that carry their own state. The "last checked · Refresh" line is passed in (main.ts).

import { h } from './dom';
import { agoLabel, isStale, overallOf, updatedLabel, whenLabel, type Overall } from './logic';
import type { Component, StatusSnapshot } from './types';

/** Row names in the banner (compact): the website, and the API that apps use. */
const ROW_NAME: Record<Component, string> = { site: 'Website', api: 'API / apps' };

/** Banner severity: up (green), warn (amber), down (red), unknown (hatched grey), error (amber outline).
 * The website affects everyone, so its failure is red; the API affects far fewer people (and the
 * fallback is simply "use the website"), so its failure alone is only a warning. */
type Kind = 'up' | 'warn' | 'down' | 'unknown' | 'error';

function icon(kind: Kind): HTMLElement {
  const glyph = { up: '✓', warn: '!', down: '✕', unknown: '?', error: '!' }[kind];
  return h('span', { class: `st-icon st-icon-${kind}`, 'aria-hidden': 'true' }, glyph);
}

function badge(state: 'up' | 'down' | 'unknown'): HTMLElement {
  const text = { up: 'Working', down: 'Not working', unknown: 'Unknown' }[state];
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
  /** One short line, or empty when the title and the rows say it all. */
  body: string;
  kind: Kind;
}

/** The banner's state and, only if it adds something, one short line. */
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
      // The banner rows are Unknown in this state (we can't vouch for them); the charts and tables
      // below still show the last data we have, so say when it is from.
      body: `That doesn’t mean Blipfoto isn’t working. The charts and tables below are from ${updatedLabel(snap.generated_at)}.`,
    };
  }
  const since = (c: Component) => {
    const s = sinceLabel(snap, c, now);
    return s ? ` Not working ${s}.` : '';
  };
  switch (overall) {
    case 'working':
      return { kind: 'up', title: 'Blipfoto is working', body: '' };
    case 'api-down':
      return {
        kind: 'warn',
        title: 'Blipfoto is working, but apps may not connect',
        body: `The website is fine. The API that apps use isn’t responding.${since('api')}`,
      };
    case 'site-down':
      return {
        kind: 'down',
        title: 'The website isn’t working',
        body: `Apps should still connect.${since('site')}`,
      };
    case 'photos':
      return {
        kind: 'down',
        title: 'Blipfoto isn’t working',
        body: `Photos aren’t loading, which affects both the website and the API.${since('site')}`,
      };
    case 'both-down':
      return {
        kind: 'down',
        title: 'Blipfoto isn’t working',
        body: since('site').trim(),
      };
    case 'partly-unknown':
      return { kind: 'unknown', title: 'Part of the status is unknown', body: '' };
    case 'unknown':
      return {
        kind: 'unknown',
        title: 'No recent data',
        body: 'We can’t tell whether Blipfoto is working.',
      };
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
    h('span', { class: 'st-part-name' }, ROW_NAME[c]),
    badge(state),
  );
}

export function renderNow(
  snap: StatusSnapshot,
  now: number,
  failedToLoad: boolean,
  footer: HTMLElement,
): HTMLElement[] {
  // Stale data, or a failed update, means the rows can't be vouched for: show them as Unknown.
  const stale = isStale(snap, now) || failedToLoad;
  const t = headline(snap, now, overallOf(snap, now), failedToLoad);
  return [
    // The headline IS the page's h1: the answer to "is Blipfoto working?".
    h(
      'div',
      { class: `st-banner-main st-banner-main-${t.kind}` },
      icon(t.kind),
      h('div', {}, h('h1', { id: 'st-now-title' }, t.title), t.body ? h('p', {}, t.body) : null),
    ),
    h(
      'ul',
      { class: 'st-parts', 'aria-label': 'Website and API' },
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
