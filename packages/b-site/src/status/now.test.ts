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
  it('all working: just the headline, the rows say the rest', () => {
    expect(text('all-good')).toEqual({ kind: 'up', title: 'Blipfoto is working', body: '' });
  });

  it('API not working: a warning, the website is fine', () => {
    const api = text('api-down');
    expect(api.kind).toBe('warn');
    expect(api.title).toBe('Blipfoto is working, but apps may not connect');
    expect(api.body).toMatch(
      /^The website is fine\. The API that apps use isn’t responding\. Not working since about \d\d:\d\d\.$/,
    );
  });

  it('website not working: apps should still connect', () => {
    const t = text('website-down');
    expect(t.kind).toBe('down');
    expect(t.title).toBe('The website isn’t working');
    expect(t.body).toMatch(/^Apps should still connect\. Not working since about \d\d:\d\d\.$/);
  });

  it('severity follows who is affected: website or both = red, API alone = amber', () => {
    const kind = (n: Parameters<typeof makeFixture>[0]) =>
      bannerKind(makeFixture(n, NOW), NOW, false);
    expect(kind('all-good')).toBe('up');
    expect(kind('website-down')).toBe('down');
    expect(kind('api-down')).toBe('warn');
    expect(kind('both-down')).toBe('down');
    expect(kind('unknown')).toBe('unknown');
    expect(kind('stale')).toBe('unknown');
  });

  it('both not working: one cause, photos', () => {
    const t = text('both-down');
    expect(t.title).toBe('Blipfoto isn’t working');
    expect(t.body).toMatch(/^Photos aren’t loading, which affects both the website and the API\./);
  });

  it('no recent data is Unknown, never working', () => {
    expect(text('unknown').kind).toBe('unknown');
    expect(text('stale').kind).toBe('unknown');
    expect(text('unknown').title).toBe('No recent data');
  });

  it('a failed load is its own amber state and never reads as working', () => {
    const t = text('all-good', true);
    expect(t.kind).toBe('error');
    expect(t.title).toBe('Couldn’t load the status');
    expect(t.body).toMatch(
      /doesn’t mean Blipfoto isn’t working\. The charts and tables below are from/,
    );
    expect(bannerKind(makeFixture('all-good', NOW), NOW, true)).toBe('error');
    expect(bannerKind(null, NOW, true)).toBe('error');
    expect(bannerKind(null, NOW, false)).toBe('loading');
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
