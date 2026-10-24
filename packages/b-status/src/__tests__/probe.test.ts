// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { runProbe, slotOf, SAMPLE_INTERVAL_MS } from '../probe.js';
import { CFG, fakeFetch, healthy } from './fixtures.js';

const noSleep = () => Promise.resolve();

describe('runProbe', () => {
  it('does not retry when everything passes', async () => {
    const out = await runProbe(CFG, { fetch: fakeFetch(healthy()), now: () => 1000 }, noSleep, 0);
    expect(out.retried).toBe(false);
    expect(out.states.site.state).toBe('up');
    expect(out.states.api.state).toBe('up');
  });

  it('a failure that passes on retry is recorded up (a blip is not an outage)', async () => {
    let browseCalls = 0;
    const base = healthy();
    const f = fakeFetch(base);
    const flaky = (url: string, init?: RequestInit) => {
      if (url.endsWith('/browse') && ++browseCalls === 1) return Promise.reject(new Error('x'));
      return f(url, init);
    };
    const out = await runProbe(CFG, { fetch: flaky, now: () => 1000 }, noSleep, 0);
    expect(out.retried).toBe(true);
    expect(out.states.site.state).toBe('up');
    expect(out.states.site.failed).toEqual([]);
  });

  it('is down only when it fails on both attempts, naming the failed checks', async () => {
    const stubs = { ...healthy(), 'https://img.test/p.jpg': { status: 503 } };
    const out = await runProbe(CFG, { fetch: fakeFetch(stubs), now: () => 1000 }, noSleep, 0);
    expect(out.retried).toBe(true);
    expect(out.states.site).toEqual({ state: 'down', failed: ['photo'] });
    expect(out.states.api).toEqual({ state: 'down', failed: ['photo'] });
  });

  it('only waits the retry delay when a retry happens', async () => {
    const waits: number[] = [];
    const sleep = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    await runProbe(CFG, { fetch: fakeFetch(healthy()), now: () => 0 }, sleep, 5000);
    expect(waits).toEqual([]);
    const bad = { ...healthy(), 'https://site.test/browse': { status: 500 } };
    await runProbe(CFG, { fetch: fakeFetch(bad), now: () => 0 }, sleep, 5000);
    expect(waits).toEqual([5000]);
  });

  it('slots are 15-minute buckets', () => {
    expect(slotOf(0)).toBe(0);
    expect(slotOf(SAMPLE_INTERVAL_MS - 1)).toBe(0);
    expect(slotOf(SAMPLE_INTERVAL_MS)).toBe(1);
  });
});
