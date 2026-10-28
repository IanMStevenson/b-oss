import { describe, expect, it } from 'vitest';
import { makeFixture } from './fixtures';
import { MINUTE } from './logic';
import {
  REASON_NO_REACH,
  REASON_NO_REPORT,
  bannerKind,
  headline,
  lastCheckedAt,
  lastCheckedText,
  rowStates,
} from './now';
import { overallOf, timeOf } from './logic';

const NOW = Date.UTC(2026, 9, 22, 14, 57);
const text = (name: Parameters<typeof makeFixture>[0], failed = false) => {
  const snap = makeFixture(name, NOW);
  return headline(snap, NOW, overallOf(snap, NOW), failed);
};

const kind = (n: Parameters<typeof makeFixture>[0], failed = false) =>
  bannerKind(makeFixture(n, NOW), NOW, failed);
const rows = (n: Parameters<typeof makeFixture>[0], failed = false) =>
  rowStates(makeFixture(n, NOW), NOW, failed);

describe('banner headline', () => {
  it('all working: just the headline, the rows say the rest', () => {
    expect(text('all-good')).toEqual({ kind: 'up', title: 'Blipfoto is working', body: '' });
  });

  it('API not working: the banner stays green (the website is fine) and the words say what to expect', () => {
    const api = text('api-down');
    expect(api.kind).toBe('up');
    expect(api.title).toBe('Blipfoto is working, but apps may not connect');
    expect(api.body).toMatch(
      /^The website is fine\. The API that apps use isn’t responding\. Not working since about \d\d:\d\d\.$/,
    );
  });

  it('website not working: red, apps should still connect', () => {
    const t = text('website-down');
    expect(t.kind).toBe('down');
    expect(t.title).toBe('The website isn’t working');
    expect(t.body).toMatch(/^Apps should still connect\. Not working since about \d\d:\d\d\.$/);
  });

  it('both not working: red, one cause, photos', () => {
    const t = text('both-down');
    expect(t.kind).toBe('down');
    expect(t.title).toBe('Blipfoto isn’t working');
    expect(t.body).toMatch(/^Photos aren’t loading, which affects both the website and the API\./);
  });

  it('can’t tell is ONE state with one reason line per cause', () => {
    for (const n of ['unknown', 'stale'] as const) {
      expect(text(n)).toEqual({
        kind: 'unknown',
        title: 'We can’t tell if Blipfoto is working',
        body: REASON_NO_REPORT,
      });
    }
    const failed = text('all-good', true);
    expect(failed).toEqual({
      kind: 'unknown',
      title: 'We can’t tell if Blipfoto is working',
      body: REASON_NO_REACH,
    });
    expect(REASON_NO_REPORT).toBe('Our checks haven’t reported recently.');
    expect(REASON_NO_REACH).toBe('We couldn’t reach the status service. Refresh to try again.');
  });

  it('uses plain words: no Up/Down/Site, no "outage", no "problem" for measured things', () => {
    for (const n of [
      'all-good',
      'api-down',
      'website-down',
      'both-down',
      'unknown',
      'stale',
    ] as const) {
      const t = text(n);
      expect(`${t.title} ${t.body}`).not.toMatch(/\b(up|down|site)\b|outage|problem/i);
    }
  });
});

describe('banner colour follows the website; each row follows its own service', () => {
  it('banner kind is the website’s state', () => {
    expect(kind('all-good')).toBe('up');
    expect(kind('api-down')).toBe('up'); // API alone: green banner, red API row
    expect(kind('website-down')).toBe('down');
    expect(kind('both-down')).toBe('down');
    expect(kind('unknown')).toBe('unknown');
    expect(kind('stale')).toBe('unknown');
    expect(kind('all-good', true)).toBe('unknown'); // couldn't reach the service
    expect(bannerKind(null, NOW, true)).toBe('unknown');
    expect(bannerKind(null, NOW, false)).toBe('loading');
  });

  it('rows show each part’s own state', () => {
    expect(rows('all-good')).toEqual({ site: 'up', api: 'up' });
    expect(rows('api-down')).toEqual({ site: 'up', api: 'down' });
    expect(rows('website-down')).toEqual({ site: 'down', api: 'up' });
    expect(rows('both-down')).toEqual({ site: 'down', api: 'down' });
  });

  it('a failed update or stale data makes both rows Unknown (never Working)', () => {
    expect(rows('unknown')).toEqual({ site: 'unknown', api: 'unknown' });
    expect(rows('stale')).toEqual({ site: 'unknown', api: 'unknown' });
    expect(rows('all-good', true)).toEqual({ site: 'unknown', api: 'unknown' });
  });

  it('there is no amber banner kind any more', () => {
    for (const n of [
      'all-good',
      'api-down',
      'website-down',
      'both-down',
      'unknown',
      'stale',
    ] as const) {
      expect(['up', 'down', 'unknown']).toContain(kind(n));
    }
  });

  it('one part unknown: the banner follows the website and the words say so', () => {
    const snap = makeFixture('api-down', NOW);
    snap.now.api.state = 'unknown';
    expect(headline(snap, NOW, overallOf(snap, NOW), false)).toEqual({
      kind: 'up',
      title: 'The website is working',
      body: 'We can’t tell if the API is working.',
    });
    const down = makeFixture('website-down', NOW);
    down.now.api.state = 'unknown';
    expect(headline(down, NOW, overallOf(down, NOW), false).body).toMatch(
      /^We can’t tell if the API is working\. Not working since/,
    );
    const siteUnknown = makeFixture('all-good', NOW);
    siteUnknown.now.site.state = 'unknown';
    expect(headline(siteUnknown, NOW, overallOf(siteUnknown, NOW), false).kind).toBe('unknown');
  });
});

describe('last checked', () => {
  it('is the most recent check across both parts, said once', () => {
    const snap = makeFixture('all-good', NOW);
    expect(lastCheckedAt(snap)).toBe(snap.now.site.checked_at);
    expect(lastCheckedText(snap, NOW)).toBe(
      `Last checked ${timeOf(snap.now.site.checked_at ?? 0)} (6 minutes ago)`,
    );
    snap.now.api.checked_at = NOW - 2 * MINUTE;
    expect(lastCheckedText(snap, NOW)).toBe(
      `Last checked ${timeOf(NOW - 2 * MINUTE)} (2 minutes ago)`,
    );
  });

  it('says so when nothing has been checked', () => {
    const snap = makeFixture('new', NOW);
    snap.now.site.checked_at = null;
    snap.now.api.checked_at = null;
    expect(lastCheckedText(snap, NOW)).toBe('Not checked yet');
  });
});
