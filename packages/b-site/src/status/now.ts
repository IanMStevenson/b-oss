// The status banner: one solid block with the state and one short line, then Site and API as
// compact rows that carry their own state. The "last checked · Refresh" line is passed in (main.ts).

import { h } from './dom';
import { agoLabel, effectiveState, overallOf, whenLabel, type Overall } from './logic';
import type { Component, State, StatusSnapshot } from './types';

/** Row names in the banner (compact): the website, and the API that apps use. */
const ROW_NAME: Record<Component, string> = { site: 'Website', api: 'API / apps' };

/** The banner's colour follows the WEBSITE row: green when it works, red when it doesn't, hatched grey
 * when we can't tell. The API (apps, far fewer people; the fallback is "use the website") shows in its
 * own row and the wording, not in the banner colour. */
type Kind = 'up' | 'down' | 'unknown';

function icon(kind: Kind): HTMLElement {
  const glyph = { up: '✓', down: '✕', unknown: '?' }[kind];
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

const CANT_TELL = 'We can’t tell if Blipfoto is working';
/** The one reason line per cause of "can't tell". */
export const REASON_NO_REPORT = 'Our checks haven’t reported recently.';
export const REASON_NO_REACH = 'We couldn’t reach the status service. Refresh to try again.';

/** The banner's state and, only if it adds something, one short line. */
export function headline(
  snap: StatusSnapshot,
  now: number,
  overall: Overall,
  failedToLoad: boolean,
): Text {
  // Can't reach the service: one merged "can't tell" state (the last data stays below, dated).
  if (failedToLoad) return { kind: 'unknown', title: CANT_TELL, body: REASON_NO_REACH };
  const since = (c: Component) => {
    const s = sinceLabel(snap, c, now);
    return s ? ` Not working ${s}.` : '';
  };
  switch (overall) {
    case 'working':
      return { kind: 'up', title: 'Blipfoto is working', body: '' };
    case 'api-down':
      return {
        kind: 'up',
        title: 'Blipfoto is working, but apps may not connect',
        body: `The website is fine. The API that apps use isn’t responding.${since('api')}`,
      };
    case 'api-unknown':
      return {
        kind: 'up',
        title: 'The website is working',
        body: 'We can’t tell if the API is working.',
      };
    case 'site-down':
      return {
        kind: 'down',
        title: 'The website isn’t working',
        body: `Apps should still connect.${since('site')}`,
      };
    case 'site-down-api-unknown':
      return {
        kind: 'down',
        title: 'The website isn’t working',
        body: `We can’t tell if the API is working.${since('site')}`,
      };
    case 'photos':
      return {
        kind: 'down',
        title: 'Blipfoto isn’t working',
        body: `Photos aren’t loading, which affects both the website and the API.${since('site')}`,
      };
    case 'both-down':
      return { kind: 'down', title: 'Blipfoto isn’t working', body: since('site').trim() };
    case 'site-unknown':
      return { kind: 'unknown', title: 'We can’t tell if the website is working', body: '' };
    case 'cant-tell':
      return { kind: 'unknown', title: CANT_TELL, body: REASON_NO_REPORT };
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

/** What each row shows. A failed update means we can't vouch for either part. */
export function rowStates(
  snap: StatusSnapshot,
  now: number,
  failedToLoad: boolean,
): Record<Component, State> {
  return failedToLoad
    ? { site: 'unknown', api: 'unknown' }
    : { site: effectiveState(snap, 'site', now), api: effectiveState(snap, 'api', now) };
}

function part(c: Component, state: State): HTMLElement {
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
  const rows = rowStates(snap, now, failedToLoad);
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
      part('site', rows.site),
      part('api', rows.api),
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
  if (!snap) return failedToLoad ? 'unknown' : 'loading';
  return headline(snap, now, overallOf(snap, now), failedToLoad).kind;
}

/** The banner when there is no data at all and the service can't be reached. */
export function renderUnavailable(footer: HTMLElement): HTMLElement[] {
  return [
    h(
      'div',
      { class: 'st-banner-main st-banner-main-unknown' },
      icon('unknown'),
      h('div', {}, h('h1', { id: 'st-now-title' }, CANT_TELL), h('p', {}, REASON_NO_REACH)),
    ),
    h(
      'ul',
      { class: 'st-parts', 'aria-label': 'Website and API' },
      part('site', 'unknown'),
      part('api', 'unknown'),
    ),
    footer,
  ];
}
