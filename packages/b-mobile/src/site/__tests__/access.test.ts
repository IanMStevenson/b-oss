// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: 'single' }));
vi.mock('../../platform/capabilities.js', () => ({
  capabilities: () => ({ site: { session: session.value } }),
}));
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('../../platform/prefs.js', () => ({
  getPref: (k: string) => Promise.resolve(store.get(k) ?? null),
  setPref: (k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  },
  deletePref: (k: string) => {
    store.delete(k);
    return Promise.resolve();
  },
}));

import {
  claimSiteSession,
  clearDesignatedExtrasAccount,
  designatedExtrasAccount,
  siteAccessFor,
} from '../access.js';

beforeEach(() => {
  store.clear();
  session.value = 'single';
});

describe('siteAccessFor (one website session for the whole app)', () => {
  it('lets the first account take it, and the account that holds it keep it', async () => {
    expect(await siteAccessFor('a1')).toEqual({ kind: 'ready' });
    await claimSiteSession('a1');
    expect(await designatedExtrasAccount()).toBe('a1');
    expect(await siteAccessFor('a1')).toEqual({ kind: 'ready' });
  });

  it('says who holds it when another account asks', async () => {
    await claimSiteSession('a1');
    expect(await siteAccessFor('a2')).toEqual({ kind: 'owned-by', accountId: 'a1' });
  });

  it('is free again once the holder is removed or signed out', async () => {
    await claimSiteSession('a1');
    await clearDesignatedExtrasAccount('a2'); // not the holder: no change
    expect(await designatedExtrasAccount()).toBe('a1');
    await clearDesignatedExtrasAccount('a1');
    expect(await siteAccessFor('a2')).toEqual({ kind: 'ready' });
  });

  it('never gets in the way where each account has its own session, or there is none', async () => {
    for (const kind of ['per-account', 'none'] as const) {
      session.value = kind;
      await claimSiteSession('a1');
      expect(await designatedExtrasAccount()).toBeNull();
      expect(await siteAccessFor('a2')).toEqual({ kind: 'ready' });
    }
  });
});
