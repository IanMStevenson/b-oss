// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { singleFlight } from '../single-flight.js';

describe('singleFlight', () => {
  it('runs one call at a time and returns whenBusy for overlapping calls', async () => {
    let release!: () => void;
    let calls = 0;
    const guarded = singleFlight(async () => {
      calls++;
      await new Promise<void>((r) => (release = r));
      return 'done';
    }, null);
    const first = guarded();
    expect(await guarded()).toBeNull();
    release();
    expect(await first).toBe('done');
    expect(calls).toBe(1);
  });

  it('allows a new call after the previous one finishes or throws', async () => {
    let n = 0;
    const guarded = singleFlight(async () => {
      if (++n === 1) throw new Error('boom');
      return n;
    }, null);
    await expect(guarded()).rejects.toThrow('boom');
    expect(await guarded()).toBe(2);
  });
});
