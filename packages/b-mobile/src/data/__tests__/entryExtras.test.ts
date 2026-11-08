// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchExtras = vi.hoisted(() => vi.fn());
vi.mock('@b-oss/b-api', async (orig) => ({
  ...(await orig<typeof import('@b-oss/b-api')>()),
  fetchEntryExtras: fetchExtras,
}));
vi.mock('../../platform/siteText.js', () => ({ fetchSiteText: vi.fn() }));

import { loadEntryExtras } from '../entryExtras.js';
import { resumeClear } from '../resumeCache.js';

const extra = { item_id: '9', thumbnail: 't', image: 'i' };

beforeEach(() => {
  fetchExtras.mockReset();
  resumeClear();
});

describe('loadEntryExtras', () => {
  it('returns the extras and caches them', async () => {
    fetchExtras.mockResolvedValue({ status: 'ok', extras: [extra] });
    expect(await loadEntryExtras('1')).toEqual([extra]);
    expect(await loadEntryExtras('1')).toEqual([extra]);
    expect(fetchExtras).toHaveBeenCalledTimes(1);
  });

  it('is quiet on failure and retries next time', async () => {
    fetchExtras.mockResolvedValueOnce({ status: 'failed', reason: 'fetch' });
    expect(await loadEntryExtras('2')).toEqual([]);
    fetchExtras.mockResolvedValueOnce({ status: 'ok', extras: [extra] });
    expect(await loadEntryExtras('2')).toEqual([extra]);
  });

  it('swallows a throw', async () => {
    fetchExtras.mockRejectedValueOnce(new Error('boom'));
    expect(await loadEntryExtras('3')).toEqual([]);
  });

  it('shares one in-flight fetch', async () => {
    fetchExtras.mockResolvedValue({ status: 'ok', extras: [] });
    await Promise.all([loadEntryExtras('4'), loadEntryExtras('4')]);
    expect(fetchExtras).toHaveBeenCalledTimes(1);
  });
});
