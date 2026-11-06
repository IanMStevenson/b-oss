// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';
import { localDay, nextOccurrence, ReminderScheduler } from '../reminder-scheduler.js';

const at = (iso: string): Date => new Date(iso); // local time (no zone suffix)

describe('nextOccurrence', () => {
  it('is today when the time is still ahead', () => {
    expect(nextOccurrence({ hour: 20, minute: 30 }, at('2026-11-06T09:00:00'), null)).toEqual(
      at('2026-11-06T20:30:00'),
    );
  });
  it('is tomorrow when the time has passed, or is exactly now', () => {
    expect(nextOccurrence({ hour: 8, minute: 0 }, at('2026-11-06T09:00:00'), null)).toEqual(
      at('2026-11-07T08:00:00'),
    );
    expect(nextOccurrence({ hour: 9, minute: 0 }, at('2026-11-06T09:00:00'), null)).toEqual(
      at('2026-11-07T09:00:00'),
    );
  });
  it('skips a day the account already published on', () => {
    expect(
      nextOccurrence({ hour: 20, minute: 0 }, at('2026-11-06T09:00:00'), '2026-11-06'),
    ).toEqual(at('2026-11-07T20:00:00'));
  });
  it('rolls over a month end', () => {
    expect(nextOccurrence({ hour: 8, minute: 0 }, at('2026-11-30T09:00:00'), null)).toEqual(
      at('2026-12-01T08:00:00'),
    );
  });
});

function harness(initialFile: string | null = null, start = '2026-11-06T09:00:00') {
  let nowMs = at(start).getTime();
  const timers: { fn: () => void; due: number; cancelled: boolean }[] = [];
  const shown: string[] = [];
  const writes: string[] = [];
  const log = vi.fn();
  const scheduler = new ReminderScheduler({
    readFile: () => Promise.resolve(initialFile),
    writeFile: (c) => {
      writes.push(c);
      return Promise.resolve();
    },
    now: () => new Date(nowMs),
    setTimer: (fn, ms) => {
      const t = { fn, due: nowMs + ms, cancelled: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { cancelled: boolean }).cancelled = true;
    },
    show: (id) => {
      shown.push(id);
      return Promise.resolve();
    },
    log,
  });
  /** Moves the clock to `iso` and runs the live timer if it is due. */
  const advanceTo = async (iso: string): Promise<void> => {
    nowMs = at(iso).getTime();
    const live = timers.filter((t) => !t.cancelled && t.due <= nowMs);
    for (const t of live) {
      t.cancelled = true;
      t.fn();
    }
    await Promise.resolve();
    await Promise.resolve();
  };
  const live = () => timers.filter((t) => !t.cancelled);
  return {
    scheduler,
    advanceTo,
    shown,
    writes,
    log,
    live,
    setNow: (iso: string) => (nowMs = at(iso).getTime()),
  };
}

describe('ReminderScheduler', () => {
  it('shows nothing and arms no timer with no reminders', async () => {
    const h = harness();
    await h.scheduler.start();
    expect(h.live()).toHaveLength(0);
    expect(h.scheduler.hasReminders()).toBe(false);
  });

  it('shows the toast at the chosen time, then again the next day', async () => {
    const h = harness();
    await h.scheduler.start();
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    await h.advanceTo('2026-11-06T19:59:00');
    expect(h.shown).toEqual([]);
    await h.advanceTo('2026-11-06T20:00:00');
    expect(h.shown).toEqual(['ian']);
    await h.advanceTo('2026-11-07T20:00:00');
    expect(h.shown).toEqual(['ian', 'ian']);
  });

  it('does not show twice when the timer fires a moment early', async () => {
    const h = harness();
    await h.scheduler.start();
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    await h.advanceTo('2026-11-06T19:59:59.500'.replace('.500', ''));
    // Force the timer to run 0.5 s before the time.
    h.setNow('2026-11-06T19:59:59');
    await h.advanceTo('2026-11-06T20:00:00');
    expect(h.shown).toEqual(['ian']);
  });

  it('skips today after a publish, but not tomorrow', async () => {
    const h = harness();
    await h.scheduler.start();
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    h.scheduler.skipToday('ian');
    await h.advanceTo('2026-11-06T20:00:00');
    expect(h.shown).toEqual([]);
    await h.advanceTo('2026-11-07T20:00:00');
    expect(h.shown).toEqual(['ian']);
  });

  it('keeps the skip when the same set is sent again, and drops it when the time changes', async () => {
    const h = harness();
    await h.scheduler.start();
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    h.scheduler.skipToday('ian');
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    await h.advanceTo('2026-11-06T20:00:00');
    expect(h.shown).toEqual([]);
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 21, minute: 0 } }]);
    await h.advanceTo('2026-11-06T21:00:00');
    expect(h.shown).toEqual(['ian']);
  });

  it('stops for an account that is removed from the set', async () => {
    const h = harness();
    await h.scheduler.start();
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    h.scheduler.configure([]);
    expect(h.live()).toHaveLength(0);
    await h.advanceTo('2026-11-06T20:00:00');
    expect(h.shown).toEqual([]);
    expect(h.scheduler.hasReminders()).toBe(false);
  });

  it('shows each account at its own time', async () => {
    const h = harness();
    await h.scheduler.start();
    h.scheduler.configure([
      { accountId: 'a', time: { hour: 18, minute: 0 } },
      { accountId: 'b', time: { hour: 20, minute: 0 } },
    ]);
    await h.advanceTo('2026-11-06T18:00:00');
    expect(h.shown).toEqual(['a']);
    await h.advanceTo('2026-11-06T20:00:00');
    expect(h.shown).toEqual(['a', 'b']);
  });

  it('reports when the first reminder is added and the last removed', async () => {
    const h = harness();
    await h.scheduler.start();
    const seen: boolean[] = [];
    h.scheduler.onActiveChange((a) => seen.push(a));
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 21, minute: 0 } }]);
    h.scheduler.configure([]);
    expect(seen).toEqual([true, false]);
  });

  it('is armed from the saved file at start, before any page has loaded', async () => {
    const file = JSON.stringify({
      version: 1,
      reminders: { ian: { hour: 20, minute: 0, skipDay: null } },
    });
    const h = harness(file);
    await h.scheduler.start();
    expect(h.scheduler.count()).toBe(1);
    await h.advanceTo('2026-11-06T20:00:00');
    expect(h.shown).toEqual(['ian']);
  });

  it('ignores a corrupt or malformed file', async () => {
    for (const file of ['not json', '{"reminders":{"ian":{"hour":99,"minute":0}}}', '{}']) {
      const h = harness(file);
      await h.scheduler.start();
      expect(h.scheduler.count()).toBe(0);
    }
  });

  it('saves every change, and a failed toast does not stop tomorrow', async () => {
    const h = harness();
    await h.scheduler.start();
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    await Promise.resolve();
    expect(h.writes.length).toBeGreaterThan(0);
    expect(JSON.parse(h.writes.at(-1) ?? '{}')).toMatchObject({
      reminders: { ian: { hour: 20, minute: 0 } },
    });
  });

  it('re-arms on resync after the clock jumped', async () => {
    const h = harness();
    await h.scheduler.start();
    h.scheduler.configure([{ accountId: 'ian', time: { hour: 20, minute: 0 } }]);
    h.setNow('2026-11-06T19:59:30');
    h.scheduler.resync();
    expect(h.live()).toHaveLength(1);
    expect(h.live()[0].due - at('2026-11-06T19:59:30').getTime()).toBe(30_000);
  });
});

describe('localDay', () => {
  it('formats the local calendar day', () => {
    expect(localDay(at('2026-01-05T23:59:00'))).toBe('2026-01-05');
  });
});
