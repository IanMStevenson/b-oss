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
    expect(await loadEntryExtras('1')).toEqual(found);
    expect(await loadEntryExtras('1')).toEqual(found);
    expect(fetchExtras).toHaveBeenCalledTimes(1);
  });

  it('is quiet on failure and retries next time', async () => {
    fetchExtras.mockResolvedValueOnce({ status: 'failed', reason: 'fetch' });
    expect(await loadEntryExtras('2')).toEqual(none);
    fetchExtras.mockResolvedValueOnce({ status: 'ok', extras: [extra] });
    expect(await loadEntryExtras('2')).toEqual(found);
  });

  it('swallows a throw', async () => {
    fetchExtras.mockRejectedValueOnce(new Error('boom'));
    expect(await loadEntryExtras('3')).toEqual(none);
  });

  it('shares one in-flight fetch', async () => {
    fetchExtras.mockResolvedValue({ status: 'ok', extras: [] });
    await Promise.all([loadEntryExtras('4'), loadEntryExtras('4')]);
    expect(fetchExtras).toHaveBeenCalledTimes(1);
  });
});

describe('protected journals (b-oss#1042)', () => {
  beforeEach(() => fetchExtras.mockResolvedValue({ status: 'protected' }));

  it('reads the extras with the website session when there is one', async () => {
    viaSession.mockResolvedValue({ kind: 'ok', extras: [extra] });
    expect(await loadEntryExtras('5')).toEqual(found);
  });

  it('asks for a sign-in when there is no usable session, and remembers that', async () => {
    viaSession.mockResolvedValue({ kind: 'needs-login' });
    expect(await loadEntryExtras('6')).toEqual({ extras: [], needsLogin: true });
    expect(await loadEntryExtras('6')).toEqual({ extras: [], needsLogin: true });
    expect(viaSession).toHaveBeenCalledTimes(1);
  });

  it('reads again after the remembered results are forgotten (a sign-in)', async () => {
    viaSession.mockResolvedValueOnce({ kind: 'needs-login' });
    expect(await loadEntryExtras('7')).toEqual({ extras: [], needsLogin: true });
    forgetEntryExtras();
    viaSession.mockResolvedValueOnce({ kind: 'ok', extras: [extra] });
    expect(await loadEntryExtras('7')).toEqual(found);
  });

  it('shows nothing, and never opens a page, where there is no website session', async () => {
    sessionAvailable.value = false;
    expect(await loadEntryExtras('8')).toEqual(none);
    expect(viaSession).not.toHaveBeenCalled();
  });

  it('shows nothing when the session read fails', async () => {
    viaSession.mockResolvedValue({ kind: 'failed' });
    expect(await loadEntryExtras('9')).toEqual(none);
  });
});
