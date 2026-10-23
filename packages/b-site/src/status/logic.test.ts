import { describe, expect, it } from 'vitest';
import { makeFixture } from './fixtures';
import {
  HISTORY_CEILING_MIN,
  HOUR,
  MINUTE,
  afterFetch,
  agoLabel,
  columnKeys,
  durationLabel,
  historyBars,
  incidentTitle,
  initialRefresh,
  isStale,
  laneBlocks,
  laneTicks,
  nextAllowedFetch,
  overallOf,
  rangeSummary,
  sharedScale,
  uptimeLabel,
  utcDayLabel,
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

  it('shows 100% plainly and otherwise two decimals, never rounding up', () => {
    expect(uptimeLabel(100)).toBe('100%');
    expect(uptimeLabel(99.9)).toBe('99.90%');
    expect(uptimeLabel(99.99)).toBe('99.99%');
    expect(uptimeLabel(null)).toBe('No data yet');
  });

  it('describes a window', () => {
    expect(windowDetail({ uptime: 100, down_minutes: 0, incidents: 0 })).toBe('No problems');
    expect(windowDetail({ uptime: 99.98, down_minutes: 60, incidents: 3 })).toBe(
      '1 h down · 3 incidents',
    );
    expect(windowDetail({ uptime: 99.5, down_minutes: 15, incidents: 1 })).toBe(
      '15 min down · 1 incident',
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

describe('refresh gating', () => {
  it('may not fetch before next_refresh_at, and may after', () => {
    expect(nextAllowedFetch(1000, 5000, initialRefresh)).toBe(5000);
    expect(nextAllowedFetch(5000, 5000, initialRefresh)).toBeNull();
    expect(nextAllowedFetch(0, null, initialRefresh)).toBeNull();
  });

  it('backs off 60 s, 2 min, then 5 min (and stays there) when nothing new arrives', () => {
    let s = initialRefresh;
    const waits: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = afterFetch(10_000, s, { ok: true, fresh: false });
      waits.push(s.notBefore - 10_000);
    }
    expect(waits).toEqual([60_000, 120_000, 300_000, 300_000, 300_000]);
  });

  it('treats a failed fetch the same way, and resets on fresh data', () => {
    let s = afterFetch(0, initialRefresh, { ok: false });
    expect(s.notBefore).toBe(60_000);
    s = afterFetch(100_000, s, { ok: true, fresh: true });
    expect(s).toEqual(initialRefresh);
  });

  it('the backoff gate wins over an already-passed next_refresh_at', () => {
    const s = afterFetch(10_000, initialRefresh, { ok: true, fresh: false });
    expect(nextAllowedFetch(20_000, 5000, s)).toBe(70_000);
    expect(nextAllowedFetch(70_000, 5000, s)).toBeNull();
  });

  it('treats data older than two intervals as stale', () => {
    const snap = makeFixture('all-good', NOW);
    expect(isStale(snap, NOW)).toBe(false);
    expect(isStale(snap, snap.generated_at + 30 * MINUTE)).toBe(false);
    expect(isStale(snap, snap.generated_at + 31 * MINUTE)).toBe(true);
  });
});

describe('overall status', () => {
  it('derives the headline case from the fixtures', () => {
    expect(overallOf(makeFixture('all-good', NOW), NOW)).toBe('working');
    expect(overallOf(makeFixture('api-down', NOW), NOW)).toBe('api-down');
    expect(overallOf(makeFixture('both-down', NOW), NOW)).toBe('photos');
    expect(overallOf(makeFixture('unknown', NOW), NOW)).toBe('unknown');
  });

  it('a stale snapshot is Unknown even if its last state was up', () => {
    expect(overallOf(makeFixture('stale', NOW), NOW)).toBe('unknown');
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

describe('history bars', () => {
  const keys = columnKeys(90, '2026-10-22', null);

  it('has one column per UTC day, ending today', () => {
    expect(keys).toHaveLength(90);
    expect(keys.at(-1)).toBe('2026-10-22');
    expect(keys[0]).toBe('2026-07-25');
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

  it('uses Monday-start weeks for all time', () => {
    const weeks = columnKeys('all', '2026-10-22', '2026-10-07');
    expect(weeks[0]).toBe('2026-10-05');
    expect(weeks.at(-1)).toBe('2026-10-19');
  });
});

describe('shared lane scale', () => {
  it('is max(5, busiest slot)', () => {
    expect(sharedScale([1, 2])).toBe(5);
    expect(sharedScale([1, 9, 3])).toBe(9);
    expect(sharedScale([])).toBe(5);
  });
});

describe('rangeSummary', () => {
  it('uses the server window when given one, and no-problems wording when clean', () => {
    const s = rangeSummary(
      'the last year',
      [],
      [],
      { uptime: 99.98, down_minutes: 60, incidents: 3 },
      0,
    );
    expect(s).toBe('99.98% over the last year · 1 h down · 3 incidents');
    expect(
      rangeSummary('the last 30 days', [], [], { uptime: 100, down_minutes: 0, incidents: 0 }, 0),
    ).toBe('100% over the last 30 days · no problems');
  });

  it('computes a rounded-down figure from the entries when there is no server window', () => {
    const keys = columnKeys(90, '2026-10-22', null);
    const s = rangeSummary('the last 90 days', [['2026-10-22', 15, 1, 0]], keys, null, 90 * 1440);
    expect(s).toBe('99.98% over the last 90 days · 15 min down · 1 incident');
  });
});

describe('shared fixtures sanity', () => {
  it('only the busy fixture has down segments in the Site lane', () => {
    expect(makeFixture('busy', NOW).last48h.site.some((s) => s.kind === 'down')).toBe(true);
    expect(makeFixture('all-good', NOW).last48h.site).toEqual([]);
    expect(sharedScale([])).toBe(5);
  });
});
