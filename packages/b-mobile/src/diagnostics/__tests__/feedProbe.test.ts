// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlipfotoError } from '@b-oss/b-api';

const prefs = new Map<string, string>();
vi.mock('../../platform/prefs.js', () => ({
  getPref: (k: string) => Promise.resolve(prefs.get(k) ?? null),
  setPref: (k: string, v: string) => {
    prefs.set(k, v);
    return Promise.resolve();
  },
}));

const page = { index: 200, size: 100, more: 1 as const };
const calls: string[] = [];
const respond = vi.fn((): Promise<unknown> => Promise.resolve({ page, entries: [{}, {}] }));
const client = new Proxy(
  {},
  {
    // `then` must be undefined or awaiting the client would treat the proxy as a thenable and hang.
    get: (_t, name: string) =>
      name === 'then'
        ? undefined
        : (opts: { pageIndex: number; pageSize: number }) => {
      calls.push(`${name}:${opts.pageIndex}:${opts.pageSize}`);
      return respond();
    },
  },
);
vi.mock('../../data/client.js', () => ({ getClient: () => Promise.resolve(client) }));
vi.mock('../../state/authReady.js', () => ({ authReady: Promise.resolve() }));
vi.mock('../../state/accountsStore.js', () => ({
  useAccountsStore: {
    getState: () => ({ activeAccountId: 'a', accounts: [{ id: 'a', username: 'ian' }] }),
  },
}));

import { runFeedProbe, maybeRunFeedProbe } from '../feedProbe.js';

beforeEach(() => {
  prefs.clear();
  calls.length = 0;
  respond.mockClear();
  vi.unstubAllEnvs();
});

describe('feedProbe', () => {
  it('probes every feed at every index/size and records what the server served', async () => {
    const rows = await runFeedProbe();
    expect(rows).toHaveLength(8 * 6);
    expect(rows[1]).toMatchObject({
      requestedIndex: 0,
      requestedSize: 100,
      servedIndex: 200,
      servedSize: 100,
      more: 1,
      count: 2,
    });
  });

  it('records an error row and carries on, but stops at a rate limit', async () => {
    respond.mockRejectedValueOnce(new Error('boom'));
    respond.mockRejectedValueOnce(new BlipfotoError(11, 'rate limited'));
    const rows = await runFeedProbe();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.error).toBe('boom');
    expect(rows[1]?.error).toBe('rate limited');
  });

  it('is inert without VITE_FEED_PROBE=1', async () => {
    await maybeRunFeedProbe();
    expect(calls).toHaveLength(0);
  });

  it('runs once when enabled, stores the result, then never again', async () => {
    vi.stubEnv('VITE_FEED_PROBE', '1');
    await maybeRunFeedProbe();
    expect(JSON.parse(prefs.get('b-mobile:feed-probe-result')!)).toHaveLength(48);
    const n = calls.length;
    await maybeRunFeedProbe();
    expect(calls).toHaveLength(n);
  });
});
