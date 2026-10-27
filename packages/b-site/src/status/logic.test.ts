import { describe, expect, it } from 'vitest';
import { FIXTURE_NAMES, makeFixture } from './fixtures';
import { componentLabel, componentName, componentThe } from './logic';
import {
  HISTORY_CEILING_MIN,
  HOUR,
  MINUTE,
  agoLabel,
  columnKeys,
  durationLabel,
  historyBars,
  incidentTitle,
  isStale,
  laneBlocks,
  laneTicks,
  REFRESH_FLOOR_MS,
  nextAllowedFetch,
  snapshotUnchanged,
  overallOf,
  sharedScale,
  uptimeLabel,
  utcDayLabel,
  visibleUptimeKeys,
  whenLabel,
  windowDetail,
} from './logic';
import type { Segment } from './types';

const NOW = Date.UTC(2026, 9, 22, 14, 57); // Thu 22 Oct 2026, 15:57 UK (BST)

describe('formatting', () => {
  it('formats durations', () => {
    expect(durationLabel(15)).toBe('15 min');
    expect(durationLabel(105)).toBe('1 h 45 min');
    expect(durationLabel(180)).toBe('3 h');
  });

  it('shows one decimal, rounded down, for ordinary figures', () => {
    expect(uptimeLabel(99.428)).toBe('99.4%');
    expect(uptimeLabel(99.0)).toBe('99.0%');
    expect(uptimeLabel(98.0)).toBe('98.0%');
    expect(uptimeLabel(94.99)).toBe('94.9%');
    expect(uptimeLabel(87.5)).toBe('87.5%');
    expect(uptimeLabel(99.899)).toBe('99.8%');
    expect(uptimeLabel(0)).toBe('0.0%');
  });

  it('shows up to three decimals (trailing zeros trimmed) for 99.9x figures', () => {
    expect(uptimeLabel(99.9)).toBe('99.9%');
    expect(uptimeLabel(99.95)).toBe('99.95%');
    expect(uptimeLabel(99.931)).toBe('99.931%');
    expect(uptimeLabel(99.999)).toBe('99.999%');
  });

  it('never rounds up: only an exact 100 reads as 100%', () => {
    expect(uptimeLabel(100)).toBe('100%');
    expect(uptimeLabel(99.9999)).toBe('99.999%');
    expect(uptimeLabel(99.99999)).toBe('99.999%');
  });

  it('is not fooled by float error in the thousandths', () => {
    for (let n = 0; n < 100_000; n += 7) {
      const p = n / 1000; // a value the server could send
      const shown = Number.parseFloat(uptimeLabel(p));
      expect(shown).toBeLessThanOrEqual(p + 1e-9);
      expect(p - shown).toBeLessThan(p >= 99.9 ? 0.0011 : 0.1001);
    }
  });

  it('says no data for null', () => {
    expect(uptimeLabel(null)).toBe('No data yet');
  });

  it('describes a window', () => {
    // 100% already says it: no repeated "No downtime" under every clean figure.
    expect(windowDetail({ uptime: 100, down_minutes: 0, incidents: 0 })).toBe('');
    expect(windowDetail({ uptime: 99.981, down_minutes: 60, incidents: 3 })).toBe(
      '1 h downtime · 3 incidents',
    );
    expect(windowDetail({ uptime: 99.5, down_minutes: 15, incidents: 1 })).toBe(
      '15 min downtime · 1 incident',
    );
    expect(windowDetail({ uptime: null, down_minutes: 0, incidents: 0 })).toBe(
      'Not enough data yet',
    );
  });

  it('labels ages', () => {
    expect(agoLabel(NOW - 6 * MINUTE, NOW)).toBe('6 minutes ago');
    expect(agoLabel(NOW - MINUTE, NOW)).toBe('1 minute ago');
    expect(agoLabel(NOW - 4 * HOUR, NOW)).toBe('about 4 hours ago');
    expect(agoLabel(NOW, NOW)).toBe('just now');
  });

  it('writes times of day in UK time and day-relative labels', () => {
    expect(whenLabel(NOW, NOW)).toBe('Today, 15:57');
    expect(whenLabel(NOW - 24 * HOUR, NOW)).toBe('Yesterday, 15:57');
    expect(whenLabel(Date.UTC(2026, 9, 10, 8, 15), NOW)).toBe('Sat 10 Oct, 09:15');
  });

  it('writes UTC day labels as the day itself', () => {
    expect(utcDayLabel('2026-10-07')).toBe('Wed 7 Oct');
  });
});

describe('refresh', () => {
  it('may refetch once 60 seconds have passed since the last fetch, whatever next_refresh_at says', () => {
    expect(REFRESH_FLOOR_MS).toBe(60_000);
    expect(nextAllowedFetch(1000, 0)).toBe(60_000);
    expect(nextAllowedFetch(59_999, 0)).toBe(60_000);
    expect(nextAllowedFetch(60_000, 0)).toBeNull();
    expect(nextAllowedFetch(500_000, 0)).toBeNull();
  });

  it('is unrestricted before the first fetch', () => {
    expect(nextAllowedFetch(0, null)).toBeNull();
  });

  it('says nothing changed only for the same snapshot AND the same share counts', () => {
    const a = makeFixture('busy', NOW);
    expect(snapshotUnchanged(a, structuredClone(a))).toBe(true);
    const moreShares = structuredClone(a);
    moreShares.shares!.hours.site = [...moreShares.shares!.hours.site, [NOW, 1]];
    expect(snapshotUnchanged(a, moreShares)).toBe(false);
    expect(snapshotUnchanged(a, { ...structuredClone(a), generated_at: a.generated_at + 1 })).toBe(
      false,
    );
    const rechecked = structuredClone(a);
    rechecked.now.site.checked_at = (a.now.site.checked_at ?? 0) + 60_000;
    expect(snapshotUnchanged(a, rechecked)).toBe(false);
    const none = makeFixture('new', NOW);
    expect(snapshotUnchanged(none, structuredClone(none))).toBe(true);
  });

  it('treats data older than two intervals as stale', () => {
    const snap = makeFixture('all-good', NOW);
    expect(isStale(snap, NOW)).toBe(false);
    expect(isStale(snap, snap.generated_at + 30 * MINUTE)).toBe(false);
    expect(isStale(snap, snap.generated_at + 31 * MINUTE)).toBe(true);
  });
});

describe('plain words for the parts', () => {
  it('says Website and API, never Site', () => {
    expect(componentName('site')).toBe('Website');
    expect(componentName('api')).toBe('API');
    expect(componentLabel(['site', 'api'])).toBe('Website and API');
    expect(componentLabel(['site'])).toBe('Website');
    expect(componentThe('site')).toBe('the website');
    expect(componentThe('api')).toBe('the API');
  });
});

describe('overall status', () => {
  it('derives the case from the two parts', () => {
    expect(overallOf(makeFixture('all-good', NOW), NOW)).toBe('working');
    expect(overallOf(makeFixture('api-down', NOW), NOW)).toBe('api-down');
    expect(overallOf(makeFixture('website-down', NOW), NOW)).toBe('site-down');
    expect(overallOf(makeFixture('both-down', NOW), NOW)).toBe('photos');
    expect(overallOf(makeFixture('unknown', NOW), NOW)).toBe('cant-tell');
  });

  it('a stale snapshot is "can’t tell" even if its last state was working', () => {
    expect(overallOf(makeFixture('stale', NOW), NOW)).toBe('cant-tell');
  });
});

describe('incident titles', () => {
  it('names the failing part in plain words', () => {
    expect(incidentTitle({ components: ['api'], failed: ['api_recent'] })).toBe(
      'API not responding',
    );
    expect(incidentTitle({ components: ['site'], failed: ['website_entry'] })).toBe(
      'Website returning errors',
    );
    expect(incidentTitle({ components: ['site', 'api'], failed: ['photo'] })).toBe(
      'Photos not loading',
    );
  });
});

describe('laneBlocks', () => {
  const from = 0;
  const to = 48 * HOUR;
  const seg = (start: number, end: number | null): Segment => ({ kind: 'down', start, end });

  it('maps time to pixels', () => {
    const [b] = laneBlocks([seg(24 * HOUR, 30 * HOUR)], from, to, 480);
    expect(b?.x).toBeCloseTo(240);
    expect(b?.w).toBeCloseTo(60);
  });

  it('never draws a block narrower than 6 px, so one 15-minute sample is visible', () => {
    const [b] = laneBlocks([seg(10 * HOUR, 10 * HOUR + 15 * MINUTE)], from, to, 480);
    expect(b?.w).toBe(6);
  });

  it('an ongoing outage ends flush against "Now" (the right edge)', () => {
    const [b] = laneBlocks([seg(to - 70 * MINUTE, null)], from, to, 480);
    expect(b?.ongoing).toBe(true);
    expect((b?.x ?? 0) + (b?.w ?? 0)).toBeCloseTo(480);
    const [tiny] = laneBlocks([seg(to - MINUTE, null)], from, to, 480);
    expect((tiny?.x ?? 0) + (tiny?.w ?? 0)).toBeCloseTo(480);
    expect(tiny?.w).toBe(6);
  });

  it('clips segments that start before the window and drops ones wholly outside', () => {
    const blocks = laneBlocks([seg(-5 * HOUR, 2 * HOUR), seg(-9 * HOUR, -8 * HOUR)], from, to, 480);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.x).toBe(0);
    expect(blocks[0]?.w).toBeCloseTo(20);
  });
});

describe('laneTicks', () => {
  it('has an hourly tick, labels every N hours, and marks midnight (UK) with the date', () => {
    const from = Date.UTC(2026, 9, 21, 15, 0); // 16:00 UK
    const to = from + 48 * HOUR;
    const ticks = laneTicks(from, to, 960, 6);
    expect(ticks.length).toBe(49);
    expect(ticks.filter((t) => t.label).map((t) => t.label)).toContain('Thu 22 Oct');
    const midnight = ticks.find((t) => t.day);
    expect(midnight?.label).toMatch(/22 Oct/);
    expect(
      ticks.filter((t) => t.label && !t.day).every((t) => /^(00|06|12|18):00$/.test(t.label ?? '')),
    ).toBe(true);
  });
});

describe('history bars (flat 30 days)', () => {
  const keys = columnKeys(30, '2026-10-22');

  it('has one column per UTC day for the last 30 days, ending today', () => {
    expect(keys).toHaveLength(30);
    expect(keys.at(-1)).toBe('2026-10-22');
    expect(keys[0]).toBe('2026-09-23');
  });

  it('scales minutes down absolutely against a 4 hour ceiling, with a 3 px minimum', () => {
    const bars = historyBars(
      keys,
      [
        ['2026-10-22', 120, 1, 0],
        ['2026-10-21', 15, 1, 0],
      ],
      900,
      80,
    );
    const today = bars.at(-1);
    const yesterday = bars.at(-2);
    expect(today?.h).toBeCloseTo(40);
    expect(today?.clipped).toBe(false);
    expect(yesterday?.h).toBe(5); // 15/240*80 = 5
    const tiny = historyBars(keys, [['2026-10-22', 1, 1, 0]], 900, 80).at(-1);
    expect(tiny?.h).toBe(3);
  });

  it('draws nothing for a perfect day', () => {
    expect(historyBars(keys, [], 900, 80).every((b) => b.h === 0)).toBe(true);
  });

  it('clips bars over the ceiling at full height and keeps the true value', () => {
    const bar = historyBars(keys, [['2026-10-22', 570, 3, 0]], 900, 80).at(-1);
    expect(bar?.clipped).toBe(true);
    expect(bar?.h).toBe(80);
    expect(bar?.minutes).toBe(570);
    expect(HISTORY_CEILING_MIN).toBe(240);
  });

  it('keeps bars slim on a wide chart and visible on a narrow one', () => {
    const wide = historyBars(keys, [['2026-10-22', 60, 1, 0]], 900, 80).at(-1);
    expect(wide?.w).toBe(18); // 900/30*0.7 = 21, capped
    const narrow = historyBars(keys, [['2026-10-22', 60, 1, 0]], 300, 80).at(-1);
    expect(narrow?.w).toBeCloseTo(7); // 300/30*0.7
    const tiny = historyBars(keys, [['2026-10-22', 60, 1, 0]], 60, 80).at(-1);
    expect(tiny?.w).toBe(2);
  });

  it('crosses a month boundary correctly', () => {
    const k = columnKeys(30, '2026-03-02');
    expect(k).toHaveLength(30);
    expect(k.at(-2)).toBe('2026-03-01');
    expect(k.at(-3)).toBe('2026-02-28');
  });
});

describe('shared lane scale', () => {
  it('is max(5, busiest slot)', () => {
    expect(sharedScale([1, 2])).toBe(5);
    expect(sharedScale([1, 9, 3])).toBe(9);
    expect(sharedScale([])).toBe(5);
  });
});

describe('fixtures follow the 30-day contract', () => {
  it('every fixture holds only the last 30 days of history and no weekly data', () => {
    const cutoff = new Date(NOW - 29 * 86_400_000).toISOString().slice(0, 10);
    for (const name of FIXTURE_NAMES) {
      const snap = makeFixture(name, NOW);
      expect('weeks' in snap.history).toBe(false);
      expect(snap.shares === undefined || !('weeks' in snap.shares)).toBe(true);
      for (const c of ['site', 'api'] as const) {
        for (const [d] of snap.history.days[c]) expect(d >= cutoff).toBe(true);
        for (const [d] of snap.shares?.days[c] ?? []) expect(d >= cutoff).toBe(true);
      }
    }
  });
});

describe('shared fixtures sanity', () => {
  it('only the busy fixture has down segments in the Site lane', () => {
    expect(makeFixture('busy', NOW).last48h.site.some((s) => s.kind === 'down')).toBe(true);
    expect(makeFixture('all-good', NOW).last48h.site).toEqual([]);
    expect(sharedScale([])).toBe(5);
  });
});

describe('visibleUptimeKeys', () => {
  const D = 24 * 60 * 60_000;
  const at = (days: number, extraMs = 0) =>
    visibleUptimeKeys(1_000 * D, 1_000 * D - days * D - extraMs);
  it('has only 24 hours and all time without a start date', () => {
    expect(visibleUptimeKeys(1_000 * D, null)).toEqual(['h24', 'all']);
  });
  it('adds each row exactly at its threshold', () => {
    expect(at(0)).toEqual(['h24', 'all']);
    expect(at(7, 1)).toEqual(['h24', 'd7', 'all']);
    expect(at(7, -1)).toEqual(['h24', 'all']);
    expect(at(7)).toEqual(['h24', 'd7', 'all']);
    expect(at(30, -1)).toEqual(['h24', 'd7', 'all']);
    expect(at(30)).toEqual(['h24', 'd7', 'd30', 'all']);
    expect(at(365, -1)).toEqual(['h24', 'd7', 'd30', 'all']);
    expect(at(365)).toEqual(['h24', 'd7', 'd30', 'd365', 'all']);
  });
});
