// The "Now" card: the headline, and a card each for Site and API.

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

const PURPOSE: Record<Component, string> = {
  site: 'blipfoto.com in a web browser',
  api: 'Used by apps such as b-ark and b-mobile',
};

function icon(kind: 'up' | 'down' | 'unknown' | 'error'): HTMLElement {
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

/** "about 14:00" (or with the day, when it wasn't today). */
function sinceLabel(snap: StatusSnapshot, c: Component, now: number): string | null {
  const open = snap.incidents.find((i) => i.ended_at === null && i.components.includes(c));
  if (!open) return null;
  const when = whenLabel(open.started_at, now);
  return `about ${when.startsWith('Today, ') ? when.slice(7) : when}`;
}

interface Text {
  title: string;
  body: string;
  kind: 'up' | 'down' | 'unknown' | 'error';
}

export function headline(
  snap: StatusSnapshot,
  now: number,
  overall: Overall,
  failedToLoad: boolean,
): Text {
  if (failedToLoad) {
    return {
      kind: 'error',
      title: 'Couldn’t load the current status',
      body: 'We couldn’t reach the monitor just now. That doesn’t mean Blipfoto is down. The last data we have is shown below, marked as out of date.',
    };
  }
  const since = (c: Component) => {
    const s = sinceLabel(snap, c, now);
    return s ? ` Not working since ${s}.` : '';
  };
  switch (overall) {
    case 'working':
      return {
        kind: 'up',
        title: 'Blipfoto is working',
        body: 'The website and the API are both working.',
      };
    case 'api-down':
      return {
        kind: 'down',
        title: 'The API is not responding',
        body: `The website is working. Apps such as b-ark and b-mobile may not be able to connect.${since('api')}`,
      };
    case 'site-down':
      return {
        kind: 'down',
        title: 'The website is not responding',
        body: `The API is working, so apps such as b-ark and b-mobile should still connect.${since('site')}`,
      };
    case 'photos':
      return {
        kind: 'down',
        title: 'Photos are not loading',
        body: `Photos are not loading, so the website and the API both show as down. That is one problem, not two.${since('site')}`,
      };
    case 'both-down':
      return {
        kind: 'down',
        title: 'Blipfoto is not responding',
        body: `Both the website and the API are down.${since('site')}`,
      };
    case 'partly-unknown':
      return {
        kind: 'unknown',
        title: 'Part of the status is unknown',
        body: 'We have no recent data for one part, so we can’t say whether it is working. The other part is working.',
      };
    case 'unknown': {
      const last = snap.now.site.checked_at ?? snap.now.api.checked_at;
      return {
        kind: 'unknown',
        title: 'No recent data',
        body: `We haven’t been able to check${last ? ` since ${timeOf(last)}` : ''}, so we can’t say whether Blipfoto is working right now. This is a problem with this page, not necessarily with Blipfoto.`,
      };
    }
  }
}

function componentCard(
  snap: StatusSnapshot,
  c: Component,
  now: number,
  stale: boolean,
): HTMLElement {
  const n = snap.now[c];
  const state = stale ? 'unknown' : n.state;
  const detail: (HTMLElement | string)[] = [];
  if (state === 'down') {
    const since = sinceLabel(snap, c, now);
    detail.push(
      h(
        'p',
        { class: 'st-detail st-detail-down' },
        `Not responding${since ? ` since ${since}` : ''}`,
      ),
    );
  }
  if (n.checked_at !== null) {
    detail.push(
      h(
        'p',
        { class: 'st-detail' },
        state === 'unknown'
          ? `Last checked ${agoLabel(n.checked_at, now)}`
          : `Checked ${agoLabel(n.checked_at, now)}`,
      ),
    );
  } else {
    detail.push(h('p', { class: 'st-detail' }, 'Not checked yet'));
  }
  return h(
    'div',
    { class: `st-component st-component-${state}` },
    h(
      'div',
      { class: 'st-component-head' },
      h('div', {}, h('h3', {}, componentName(c)), h('p', { class: 'st-purpose' }, PURPOSE[c])),
      badge(state),
    ),
    ...detail,
  );
}

export function renderNow(
  snap: StatusSnapshot,
  now: number,
  failedToLoad: boolean,
  footer: HTMLElement,
): HTMLElement[] {
  const stale = isStale(snap, now);
  const overall = overallOf(snap, now);
  const t = headline(snap, now, overall, failedToLoad);
  const out: HTMLElement[] = [
    h(
      'div',
      { class: `st-headline st-headline-${t.kind}` },
      icon(t.kind),
      h('div', {}, h('h2', { id: 'st-now-title' }, t.title), h('p', {}, t.body)),
    ),
  ];
  if (failedToLoad) {
    out.push(
      h(
        'p',
        { class: 'st-outdated' },
        `Out of date: this is the status as of ${updatedLabel(snap.generated_at)}.`,
      ),
    );
  }
  out.push(
    h(
      'div',
      { class: 'st-components' },
      componentCard(snap, 'site', now, stale),
      componentCard(snap, 'api', now, stale),
    ),
    footer,
  );
  return out;
}
