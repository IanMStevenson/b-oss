// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// data/config.ts is the one deliberate exception to "no caching for display" (rules.md) — worth a
// direct test of the cache-once behaviour itself, since every other data/*.ts fetcher in this app
// is a thin uncached pass-through with no such logic to get wrong.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCountries, getLocales, getClient } = vi.hoisted(() => ({
  getCountries: vi.fn(),
  getLocales: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock('../client.js', () => ({ getClient }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  getClient.mockResolvedValue({ getCountries, getLocales });
});

describe('fetchCountries', () => {
  it('maps the response and caches it — a second call makes no further request', async () => {
    getCountries.mockResolvedValue({
      countries: [{ country_code: 'gb', title: 'United Kingdom' }],
    });
    const { fetchCountries } = await import('../config.js');

    const first = await fetchCountries();
    const second = await fetchCountries();

    expect(first).toEqual([{ code: 'gb', title: 'United Kingdom' }]);
    expect(second).toBe(first);
    expect(getClient).toHaveBeenCalledTimes(1);
  });

  it('clears the cache on failure so the next call retries', async () => {
    getCountries.mockRejectedValueOnce(new Error('network down'));
    getCountries.mockResolvedValueOnce({ countries: [{ country_code: 'fr', title: 'France' }] });
    const { fetchCountries } = await import('../config.js');

    await expect(fetchCountries()).rejects.toThrow('network down');
    const result = await fetchCountries();

    expect(result).toEqual([{ code: 'fr', title: 'France' }]);
    expect(getClient).toHaveBeenCalledTimes(2);
  });
});

describe('fetchLocales', () => {
  it('maps the response and caches it', async () => {
    getLocales.mockResolvedValue({ locales: [{ locale_code: 'en', title: 'English' }] });
    const { fetchLocales } = await import('../config.js');

    const first = await fetchLocales();
    const second = await fetchLocales();

    expect(first).toEqual([{ code: 'en', title: 'English' }]);
    expect(second).toBe(first);
    expect(getClient).toHaveBeenCalledTimes(1);
  });
});
