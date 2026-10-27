import { describe, expect, it } from 'vitest';
import { makeFixture } from './fixtures';
import { MINUTE } from './logic';
import { bannerKind, headline, lastCheckedAt, lastCheckedText } from './now';
import { overallOf } from './logic';

const NOW = Date.UTC(2026, 9, 22, 14, 57);
const text = (name: Parameters<typeof makeFixture>[0], failed = false) => {
  const snap = makeFixture(name, NOW);
  return headline(snap, NOW, overallOf(snap, NOW), failed);
};

describe('banner headline', () => {
  it('says it plainly, with the state and one short line', () => {
    expect(text('all-good')).toEqual({
      kind: 'up',
      title: 'Blipfoto is working',
      body: 'Site and API are both up.',
    });
    const api = text('api-down');
    expect(api.kind).toBe('down');
    expect(api.title).toBe('The API is down');
    expect(api.body).toMatch(
      /^Apps such as b-ark and b-mobile may not connect\. The Site is up\. Down since about \d\d:\d\d\.$/,
    );
  });

  it('one cause for both: photos', () => {
    const t = text('both-down');
    expect(t.title).toBe('Photos aren’t loading');
    expect(t.body).toMatch(/Site and API both show as down because of it: one cause, not two/);
  });

  it('unknown and stale are Unknown, never Up', () => {
    expect(text('unknown').kind).toBe('unknown');
    expect(text('stale').kind).toBe('unknown');
    expect(text('unknown').title).toBe('Status unknown');
  });

  it('a failed load is its own amber state and never reads as working', () => {
    const t = text('all-good', true);
    expect(t.kind).toBe('error');
    expect(t.title).toBe('Couldn’t load the status');
    expect(t.body).toMatch(/doesn’t mean Blipfoto is down/);
    expect(bannerKind(makeFixture('all-good', NOW), NOW, true)).toBe('error');
    expect(bannerKind(null, NOW, true)).toBe('error');
    expect(bannerKind(null, NOW, false)).toBe('loading');
  });

  it('uses "down" and "incident" consistently: no "outage" or "problem" for measured things', () => {
    for (const n of ['all-good', 'api-down', 'both-down', 'unknown', 'stale'] as const) {
      const t = text(n);
      expect(`${t.title} ${t.body}`).not.toMatch(/outage|problem/i);
    }
  });
});

describe('last checked', () => {
  it('is the most recent check across both parts, said once', () => {
    const snap = makeFixture('all-good', NOW);
    expect(lastCheckedAt(snap)).toBe(snap.now.site.checked_at);
    expect(lastCheckedText(snap, NOW)).toBe('Last checked 6 minutes ago');
    snap.now.api.checked_at = NOW - 2 * MINUTE;
    expect(lastCheckedText(snap, NOW)).toBe('Last checked 2 minutes ago');
  });

  it('says so when nothing has been checked', () => {
    const snap = makeFixture('new', NOW);
    snap.now.site.checked_at = null;
    snap.now.api.checked_at = null;
    expect(lastCheckedText(snap, NOW)).toBe('Not checked yet');
  });
});
