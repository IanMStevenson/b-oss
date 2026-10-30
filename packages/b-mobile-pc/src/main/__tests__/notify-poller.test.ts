// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenInvalidError, type UnreadTotals } from '@b-oss/b-notify-core';
import {
  MAX_BACKOFF_TICKS,
  MIN_CHECK_GAP_MS,
  NotifyPoller,
  parseState,
  POLL_INTERVAL_MS,
  type PollerDeps,
  type ToShow,
} from '../notify-poller.js';

const BOTH = { comments: true, notifications: true };

interface Harness {
  poller: NotifyPoller;
  file: { contents: string | null };
  shown: ToShow[];
  totals: Record<string, UnreadTotals>;
  tokens: Record<string, string | null>;
  deps: PollerDeps;
  fetchTotals: ReturnType<typeof vi.fn<PollerDeps['fetchTotals']>>;
}

function harness(overrides: Partial<PollerDeps> = {}, initialFile: string | null = null): Harness {
  const file = { contents: initialFile };
  const shown: ToShow[] = [];
  const totals: Record<string, UnreadTotals> = { ann: { comments: 0, notifications: 0 } };
  const tokens: Record<string, string | null> = { ann: 'ann-token' };
  const fetchTotals = vi.fn<PollerDeps['fetchTotals']>((token) => {
    const id = Object.keys(tokens).find((k) => tokens[k] === token);
    return Promise.resolve(totals[id ?? '']);
  });
  const deps: PollerDeps = {
    readFile: () => Promise.resolve(file.contents),
    writeFile: (c) => {
      file.contents = c;
      return Promise.resolve();
    },
    getToken: (id) => Promise.resolve(tokens[id] ?? null),
    fetchTotals,
    show: (item) => {
      shown.push(item);
      return Promise.resolve();
    },
    isOnline: () => true,
    log: () => undefined,
    ...overrides,
  };
  return { poller: new NotifyPoller(deps), file, shown, totals, tokens, deps, fetchTotals };
}

/** Lets the poll that a timer started run to completion. */
const tickOnce = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('NotifyPoller', () => {
  it('records the starting counts on the first poll without announcing them', async () => {
    const h = harness();
    h.totals.ann = { comments: 4, notifications: 2 };
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    expect(h.shown).toEqual([]);
    expect(
      (JSON.parse(h.file.contents ?? '{}') as { accounts: Record<string, { seen: unknown }> })
        .accounts.ann.seen,
    ).toEqual({
      comments: 4,
      notifications: 2,
    });
  });

  it('shows one notification per rise, polling every five minutes', async () => {
    const h = harness();
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce(); // baseline
    h.totals.ann = { comments: 3, notifications: 0 };
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.shown).toEqual([
      { payload: { kind: 'activity', stream: 'comments', accountId: 'ann' }, count: 3 },
    ]);
    await tickOnce(POLL_INTERVAL_MS); // unchanged: nothing more
    expect(h.shown).toHaveLength(1);
    h.totals.ann = { comments: 3, notifications: 1 };
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.shown).toHaveLength(2);
    expect(h.shown[1].payload).toMatchObject({ stream: 'notifications' });
  });

  it('says nothing for a stream switched off, and sends no catch-up when it is switched back on', async () => {
    const h = harness();
    await h.poller.start();
    await h.poller.configure([
      { accountId: 'ann', streams: { comments: false, notifications: true } },
    ]);
    await tickOnce();
    h.totals.ann = { comments: 5, notifications: 0 };
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.shown).toEqual([]);
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.shown).toEqual([]);
    h.totals.ann = { comments: 6, notifications: 0 };
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.shown).toHaveLength(1);
  });

  it('keeps the old total when the notification cannot be shown, and tries again next time', async () => {
    const show = vi.fn<PollerDeps['show']>().mockRejectedValueOnce(new Error('no toast'));
    const h = harness({ show });
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    h.totals.ann = { comments: 2, notifications: 0 };
    await tickOnce(POLL_INTERVAL_MS); // fails, backs off one tick
    expect(show).toHaveBeenCalledTimes(1);
    await tickOnce(POLL_INTERVAL_MS); // skipped
    expect(show).toHaveBeenCalledTimes(1);
    await tickOnce(POLL_INTERVAL_MS);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show.mock.calls[1][0].count).toBe(2);
  });

  it('on a dead token shows exactly one sign-in-again notification and stops polling that account', async () => {
    const h = harness();
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    h.fetchTotals.mockRejectedValue(new TokenInvalidError());
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.shown).toEqual([{ payload: { kind: 'reauth-required', accountId: 'ann' }, count: 0 }]);
    const calls = h.fetchTotals.mock.calls.length;
    await tickOnce(POLL_INTERVAL_MS * 3);
    expect(h.fetchTotals).toHaveBeenCalledTimes(calls);
    expect(h.shown).toHaveLength(1);
  });

  it('records the dead-token flag on the current state even if the account was reconfigured meanwhile', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness({
      show: async (item) => {
        h.shown.push(item);
        await gate;
      },
    });
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    h.fetchTotals.mockRejectedValue(new TokenInvalidError());
    await tickOnce(POLL_INTERVAL_MS); // blocked inside show()
    await h.poller.configure([
      { accountId: 'ann', streams: { comments: true, notifications: false } },
    ]);
    release();
    await tickOnce();
    const saved = JSON.parse(h.file.contents ?? '{}') as {
      accounts: Record<string, { reauthShown: boolean }>;
    };
    expect(saved.accounts.ann.reauthShown).toBe(true);
    await tickOnce(POLL_INTERVAL_MS * 3);
    expect(h.shown).toHaveLength(1);
  });

  it('forgets the dead-token flag once the app removes the account, so a fresh sign-in polls again', async () => {
    const h = harness();
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    h.fetchTotals.mockRejectedValueOnce(new TokenInvalidError());
    await tickOnce(POLL_INTERVAL_MS);
    await h.poller.configure([]);
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    h.totals.ann = { comments: 1, notifications: 0 };
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.shown.at(-1)?.payload).toMatchObject({ kind: 'activity' });
  });

  it('does not call the API for an account with no token, or while offline', async () => {
    let online = false;
    const h = harness({ isOnline: () => online });
    h.tokens.ann = null;
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.fetchTotals).not.toHaveBeenCalled();
    h.tokens.ann = 'ann-token';
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.fetchTotals).not.toHaveBeenCalled(); // still offline
    online = true;
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.fetchTotals).toHaveBeenCalledTimes(1);
  });

  it('backs off on errors, up to a cap, and recovers', async () => {
    const h = harness();
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    h.fetchTotals.mockRejectedValue(new Error('503'));
    const before = h.fetchTotals.mock.calls.length;
    await tickOnce(POLL_INTERVAL_MS * 40);
    const attempts = h.fetchTotals.mock.calls.length - before;
    expect(attempts).toBeLessThan(10);
    expect(attempts).toBeGreaterThan(40 / (MAX_BACKOFF_TICKS + 1) - 1);
    h.fetchTotals.mockResolvedValue({ comments: 0, notifications: 0 });
    const resumed = h.fetchTotals.mock.calls.length;
    await tickOnce(POLL_INTERVAL_MS * (MAX_BACKOFF_TICKS + 1));
    expect(h.fetchTotals.mock.calls.length).toBeGreaterThan(resumed);
  });

  it('polls each configured account with its own token and logs no token', async () => {
    const log = vi.fn<(m: string) => void>();
    const h = harness({ log });
    h.tokens.bob = 'bob-token';
    h.totals.bob = { comments: 0, notifications: 0 };
    await h.poller.start();
    await h.poller.configure([
      { accountId: 'ann', streams: BOTH },
      { accountId: 'bob', streams: BOTH },
    ]);
    await tickOnce();
    expect(h.fetchTotals.mock.calls.map((c) => c[0]).sort()).toEqual(['ann-token', 'bob-token']);
    h.fetchTotals.mockRejectedValue(new Error('x ann-token'));
    await tickOnce(POLL_INTERVAL_MS);
    for (const [message] of log.mock.calls) expect(message).not.toContain('token');
  });

  it('reports whether there is anything to poll for, and survives a restart without repeating', async () => {
    const h = harness();
    const active = vi.fn<(a: boolean) => void>();
    h.poller.onActiveChange(active);
    await h.poller.start();
    expect(h.poller.hasAccounts()).toBe(false);
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    expect(active).toHaveBeenLastCalledWith(true);
    await tickOnce();
    h.totals.ann = { comments: 1, notifications: 0 };
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.shown).toHaveLength(1);
    h.poller.stop();

    const restarted = harness({}, h.file.contents);
    restarted.totals.ann = { comments: 1, notifications: 0 };
    await restarted.poller.start();
    expect(restarted.poller.hasAccounts()).toBe(true);
    await tickOnce();
    expect(restarted.shown).toEqual([]); // already seen before the restart
    await h.poller.configure([]);
  });
});

describe('parseState', () => {
  it('starts fresh from damaged or unrecognised files', () => {
    for (const raw of [null, '', '{', '[]', '{"v":2,"accounts":{}}', '{"v":1}']) {
      expect(parseState(raw)).toEqual({ v: 1, accounts: {} });
    }
  });

  it('drops malformed accounts and bad counts', () => {
    const raw = JSON.stringify({
      v: 1,
      accounts: {
        ok: {
          streams: BOTH,
          seen: { comments: 1, notifications: 2 },
          lastPolledAt: 5,
          reauthShown: true,
        },
        badStreams: { streams: { comments: 'yes' } },
        badSeen: { streams: BOTH, seen: { comments: -1, notifications: 2 } },
      },
    });
    const state = parseState(raw);
    expect(Object.keys(state.accounts)).toEqual(['ok', 'badSeen']);
    expect(state.accounts.ok.reauthShown).toBe(true);
    expect(state.accounts.badSeen.seen).toBeNull();
  });
});

describe('NotifyPoller observability (b-oss#677, #673)', () => {
  const lines = (log: ReturnType<typeof vi.fn<(m: string) => void>>): string[] =>
    log.mock.calls.map(([m]) => m);

  it('logs start, configure, baseline, each poll and every show / suppress decision', async () => {
    const log = vi.fn<(m: string) => void>();
    const h = harness({ log });
    await h.poller.start();
    await h.poller.configure([
      { accountId: 'ann', streams: { comments: true, notifications: false } },
    ]);
    await tickOnce();
    h.totals.ann = { comments: 2, notifications: 3 };
    await tickOnce(POLL_INTERVAL_MS);
    const out = lines(log).join('\n');
    expect(out).toContain('poller started: interval=300s');
    expect(out).toContain('configured: accounts=[ann(comments)]');
    expect(out).toContain('poll baseline account=ann comments=0 notifications=0');
    expect(out).toContain('poll ok account=ann comments=2 (was 0) notifications=3 (was 0)');
    expect(out).toContain('stream=comments new=2: showing');
    expect(out).toContain('stream=notifications new=3: suppressed, stream is switched off');
    expect(out).not.toContain('ann-token');
    expect(out).not.toMatch(/token/i);
  });

  it('logs why a poll did not happen: offline, no saved sign-in, backing off', async () => {
    const log = vi.fn<(m: string) => void>();
    let online = false;
    const h = harness({ log, isOnline: () => online });
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    expect(lines(log).join('\n')).toContain('poll skipped: the system reports no network connection');
    expect(h.poller.getStatus().accounts[0].result?.kind).toBe('offline');
    online = true;
    h.tokens.ann = null;
    await tickOnce(POLL_INTERVAL_MS);
    expect(lines(log).join('\n')).toContain('no saved sign-in in the secure store');
    expect(h.poller.getStatus().accounts[0].result?.kind).toBe('no-token');
  });

  it('reports last checked, next check and the last result per account', async () => {
    vi.setSystemTime(1_000_000);
    const h = harness();
    await h.poller.start();
    expect(h.poller.getStatus().accounts).toEqual([]);
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    const before = h.poller.getStatus().accounts[0];
    expect(before.lastCheckedAt).toBeNull();
    expect(before.result).toBeNull();
    await tickOnce();
    const after = h.poller.getStatus().accounts[0];
    expect(after.lastCheckedAt).toBe(1_000_000);
    expect(after.nextCheckAt).toBe(1_000_000 + POLL_INTERVAL_MS);
    expect(after.result?.kind).toBe('baseline');
    h.totals.ann = { comments: 1, notifications: 0 };
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.poller.getStatus().accounts[0].result).toMatchObject({ kind: 'ok', newItems: 1 });
  });

  it('classifies failures for the status line without leaking the secret', async () => {
    const log = vi.fn<(m: string) => void>();
    const h = harness({ log });
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    const limited = Object.assign(new Error('slow down ann-token'), { name: 'BlipfotoError', code: 11 });
    h.fetchTotals.mockRejectedValueOnce(limited);
    await tickOnce(POLL_INTERVAL_MS);
    expect(h.poller.getStatus().accounts[0].result?.kind).toBe('rate-limited');
    h.fetchTotals.mockRejectedValue(new Error('x ann-token'));
    await h.poller.checkNow(); // rate limited: not forced
    expect(h.poller.getStatus().accounts[0].result?.kind).toBe('rate-limited');
    expect(lines(log).join('\n')).not.toContain('ann-token');
  });

  it('Check now polls at once, skips backoff, restarts the timer, and respects the minimum gap', async () => {
    vi.setSystemTime(5_000_000);
    const h = harness();
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce(); // baseline
    h.fetchTotals.mockRejectedValueOnce(new Error('boom'));
    await tickOnce(POLL_INTERVAL_MS); // fails: backs off
    expect(h.poller.getStatus().accounts[0].result?.kind).toBe('error');
    const calls = h.fetchTotals.mock.calls.length;
    await h.poller.checkNow(); // within 10 s of the last attempt: held back
    expect(h.fetchTotals.mock.calls.length).toBe(calls);
    await vi.advanceTimersByTimeAsync(MIN_CHECK_GAP_MS);
    h.totals.ann = { comments: 2, notifications: 0 };
    const status = await h.poller.checkNow();
    expect(h.fetchTotals.mock.calls.length).toBe(calls + 1);
    expect(h.shown).toHaveLength(1);
    expect(status.accounts[0].result?.kind).toBe('ok');
    expect(status.accounts[0].nextCheckAt).toBe(Date.now() + POLL_INTERVAL_MS);
  });

  it('Check now also tries when the system says it is offline', async () => {
    const log = vi.fn<(m: string) => void>();
    const h = harness({ log, isOnline: () => false });
    await h.poller.start();
    await h.poller.configure([{ accountId: 'ann', streams: BOTH }]);
    await tickOnce();
    expect(h.fetchTotals).not.toHaveBeenCalled();
    await h.poller.checkNow();
    expect(h.fetchTotals).toHaveBeenCalledTimes(1);
    expect(lines(log).join('\n')).toContain('trying anyway');
  });
});
