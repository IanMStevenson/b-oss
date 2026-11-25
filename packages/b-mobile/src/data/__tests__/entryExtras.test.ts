// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchExtras = vi.hoisted(() => vi.fn());
vi.mock('@b-oss/b-api', async (orig) => ({
  ...(await orig<typeof import('@b-oss/b-api')>()),
  fetchEntryExtras: fetchExtras,
}));
vi.mock('../../platform/siteText.js', () => ({ fetchSiteText: vi.fn() }));
const sessionAvailable = vi.hoisted(() => ({ value: true }));
vi.mock('../../platform/siteSession.js', () => ({
  siteSessionAvailable: () => sessionAvailable.value,
}));
const viaSession = vi.hoisted(() => vi.fn());
vi.mock('../../flows/extrasFlow.js', () => ({ readExtrasViaSession: viaSession }));

import { forgetEntryExtras, loadEntryExtras } from '../entryExtras.js';
import { resumeClear } from '../resumeCache.js';

const acct = { id: 'a1', username: 'ian' };
const extra = { item_id: '9', thumbnail: 't', image: 'i' };
const found = { extras: [extra], needsLogin: false };
const none = { extras: [], needsLogin: false };

beforeEach(() => {
  fetchExtras.mockReset();
  viaSession.mockReset();
  sessionAvailable.value = true;
  resumeClear();
});

describe('loadEntryExtras', () => {
  it('returns the extras and caches them', async () => {
    fetchExtras.mockResolvedValue({ status: 'ok', extras: [extra] });
    expect(await loadEntryExtras('1', acct)).toEqual(found);
    expect(await loadEntryExtras('1', acct)).toEqual(found);
    expect(fetchExtras).toHaveBeenCalledTimes(1);
  });

  it('is quiet on failure and retries next time', async () => {
    fetchExtras.mockResolvedValueOnce({ status: 'failed', reason: 'fetch' });
    expect(await loadEntryExtras('2', acct)).toEqual(none);
    fetchExtras.mockResolvedValueOnce({ status: 'ok', extras: [extra] });
    expect(await loadEntryExtras('2', acct)).toEqual(found);
  });

  it('swallows a throw', async () => {
    fetchExtras.mockRejectedValueOnce(new Error('boom'));
    expect(await loadEntryExtras('3', acct)).toEqual(none);
  });

  it('shares one in-flight fetch', async () => {
    fetchExtras.mockResolvedValue({ status: 'ok', extras: [] });
    await Promise.all([loadEntryExtras('4', acct), loadEntryExtras('4', acct)]);
    expect(fetchExtras).toHaveBeenCalledTimes(1);
  });
});

describe('protected journals (b-oss#1042)', () => {
  beforeEach(() => fetchExtras.mockResolvedValue({ status: 'protected' }));

  it('reads the extras with the website session when there is one', async () => {
    viaSession.mockResolvedValue({ kind: 'ok', extras: [extra] });
    expect(await loadEntryExtras('5', acct)).toEqual(found);
  });

  it('asks for a sign-in when there is no usable session, and reads again next time', async () => {
    viaSession.mockResolvedValue({ kind: 'needs-login' });
    expect(await loadEntryExtras('6', acct)).toEqual({ extras: [], needsLogin: true });
    // Not remembered: a member who has just signed in (elsewhere) must not see a stale notice.
    viaSession.mockResolvedValueOnce({ kind: 'ok', extras: [extra] });
    expect(await loadEntryExtras('6', acct)).toEqual(found);
    expect(viaSession).toHaveBeenCalledTimes(2);
  });

  it('remembers what it read, until the remembered results are forgotten', async () => {
    viaSession.mockResolvedValueOnce({ kind: 'ok', extras: [extra] });
    expect(await loadEntryExtras('7', acct)).toEqual(found);
    expect(await loadEntryExtras('7', acct)).toEqual(found);
    expect(viaSession).toHaveBeenCalledTimes(1);
    forgetEntryExtras(); // extras changed, or the session did
    viaSession.mockResolvedValueOnce({ kind: 'ok', extras: [] });
    expect(await loadEntryExtras('7', acct)).toEqual(none);
    expect(viaSession).toHaveBeenCalledTimes(2);
  });

  it('shows nothing, and never opens a page, where there is no website session', async () => {
    sessionAvailable.value = false;
    expect(await loadEntryExtras('8', acct)).toEqual(none);
    expect(viaSession).not.toHaveBeenCalled();
  });

  it('shows nothing when the session read fails', async () => {
    viaSession.mockResolvedValue({ kind: 'failed' });
    expect(await loadEntryExtras('9', acct)).toEqual(none);
  });
});

describe('per account (never serve one member what another could read)', () => {
  it('does not share a cached result between accounts', async () => {
    fetchExtras.mockResolvedValue({ status: 'protected' });
    viaSession.mockResolvedValueOnce({ kind: 'ok', extras: [extra] });
    expect(await loadEntryExtras('20', acct)).toEqual(found);
    // Another account asks for the same entry: it gets its own read, not the first one's result.
    viaSession.mockResolvedValueOnce({ kind: 'needs-login' });
    const other = { id: 'a2', username: 'sam' };
    expect(await loadEntryExtras('20', other)).toEqual({ extras: [], needsLogin: true });
    expect(viaSession).toHaveBeenCalledTimes(2);
    expect(viaSession.mock.calls[1]?.[1]).toEqual(other);
  });

  it('shows nothing for a protected entry with no account at all', async () => {
    fetchExtras.mockResolvedValue({ status: 'protected' });
    expect(await loadEntryExtras('21', null)).toEqual(none);
    expect(viaSession).not.toHaveBeenCalled();
  });
});
