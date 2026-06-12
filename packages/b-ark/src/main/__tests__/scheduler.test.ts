// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PortableSchedule } from '@b-oss/b-ark-ui-electron';
import { BackupScheduler, computeNextRun } from '../scheduler.js';

interface Harness {
  nextRun: string;
  schedule: PortableSchedule;
  accountOrder: string[];
}

function makeHarness(over: Partial<PortableSchedule> = {}): Harness {
  const nextRun = new Date(Date.now() + 5).toISOString();
  return {
    nextRun,
    schedule: { enabled: true, hour: 2, interval: 'daily', next_run: nextRun, ...over },
    accountOrder: ['only'],
  };
}

describe('BackupScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not arm a timer when schedule is disabled', async () => {
    const advance = vi.fn(async () => {});
    const run = vi.fn(async () => {});
    const s = new BackupScheduler(
      () => ({
        enabled: false,
        hour: 2,
        interval: 'daily',
        next_run: new Date(Date.now() + 10).toISOString(),
      }),
      () => ['a', 'b'],
      run,
      advance,
    );
    s.rearm();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });

  it('runs all accounts sequentially in account_order when the timer fires', async () => {
    const h = makeHarness();
    h.accountOrder = ['a', 'b', 'c'];
    const order: string[] = [];
    const run = vi.fn(async (id: string) => {
      order.push(`start:${id}`);
      await Promise.resolve();
      order.push(`end:${id}`);
    });
    const advance = vi.fn(() => {
      // After the pass, push next_run far out so we don't re-fire.
      h.schedule = { ...h.schedule, next_run: new Date(Date.now() + 60_000).toISOString() };
      return Promise.resolve();
    });
    const s = new BackupScheduler(
      () => h.schedule,
      () => h.accountOrder,
      run,
      advance,
    );
    s.rearm();
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
    expect(advance).toHaveBeenCalledOnce();
  });

  it('continues the sequential pass even if one account throws', async () => {
    const h = makeHarness();
    h.accountOrder = ['a', 'b'];
    const ran: string[] = [];
    const run = vi.fn((id: string) => {
      ran.push(id);
      if (id === 'a') throw new Error('boom');
      return Promise.resolve();
    });
    const advance = vi.fn(() => {
      h.schedule = { ...h.schedule, next_run: new Date(Date.now() + 60_000).toISOString() };
      return Promise.resolve();
    });
    const s = new BackupScheduler(
      () => h.schedule,
      () => h.accountOrder,
      run,
      advance,
    );
    s.rearm();
    await vi.advanceTimersByTimeAsync(10);
    expect(ran).toEqual(['a', 'b']);
    expect(advance).toHaveBeenCalledOnce();
  });

  it('coalesces a fire-while-busy into exactly one re-pass', async () => {
    const h = makeHarness();
    const releases: Array<() => void> = [];
    const run = vi.fn(() => {
      return new Promise<void>((r) => {
        releases.push(r);
      });
    });
    const advance = vi.fn(() => {
      h.schedule = { ...h.schedule, next_run: new Date(Date.now() + 60_000).toISOString() };
      return Promise.resolve();
    });
    const s = new BackupScheduler(
      () => h.schedule,
      () => h.accountOrder,
      run,
      advance,
    );
    s.rearm();
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(1);
    // Force a fire-while-busy by re-arming with a now-due schedule.
    h.schedule = { ...h.schedule, next_run: new Date(Date.now() - 1).toISOString() };
    s.rearm();
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(1); // still queued behind the in-flight run
    // Release the first run; the re-pass should kick off.
    releases[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(advance).toHaveBeenCalledTimes(1);
    // Release the second run; advance should now have been called twice.
    releases[1]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(advance).toHaveBeenCalledTimes(2);
  });

  it('cancel() prevents a pending fire', async () => {
    const run = vi.fn(async () => {});
    const advance = vi.fn(async () => {});
    const s = new BackupScheduler(
      () => ({
        enabled: true,
        hour: 2,
        interval: 'daily',
        next_run: new Date(Date.now() + 50).toISOString(),
      }),
      () => ['a'],
      run,
      advance,
    );
    s.rearm();
    s.cancel();
    await vi.advanceTimersByTimeAsync(200);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('computeNextRun', () => {
  it('returns later today when hour is in the future', () => {
    const now = new Date('2026-05-26T09:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const r = computeNextRun(23, 'daily');
      expect(new Date(r).getTime()).toBeGreaterThan(now.getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it('rolls forward when the target hour has passed today', () => {
    const now = new Date('2026-05-26T15:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const r = computeNextRun(2, 'daily');
      const diff = new Date(r).getTime() - now.getTime();
      expect(diff).toBeGreaterThan(0);
      expect(diff).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    } finally {
      vi.useRealTimers();
    }
  });
});
