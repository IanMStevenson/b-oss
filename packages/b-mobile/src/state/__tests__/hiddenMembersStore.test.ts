// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// rules.md, "Hiding: what suppression means" — the list is per account and device-local. One
// test per rule actually stated there, same density approach as accountsFlow.test.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

import { useHiddenMembersStore } from '../hiddenMembersStore.js';

beforeEach(() => {
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: false });
});

describe('hiddenMembersStore', () => {
  it('hide adds a username to that account only', () => {
    useHiddenMembersStore.getState().hide('alice', 'bob');
    expect(useHiddenMembersStore.getState().hiddenByAccount).toEqual({ alice: ['bob'] });
    expect(useHiddenMembersStore.getState().hiddenByAccount.carol).toBeUndefined();
  });

  it('hiding the same username twice does not duplicate it', () => {
    useHiddenMembersStore.getState().hide('alice', 'bob');
    useHiddenMembersStore.getState().hide('alice', 'bob');
    expect(useHiddenMembersStore.getState().hiddenByAccount.alice).toEqual(['bob']);
  });

  it('unhide removes exactly that username, leaving the rest', () => {
    useHiddenMembersStore.getState().hide('alice', 'bob');
    useHiddenMembersStore.getState().hide('alice', 'carol');
    useHiddenMembersStore.getState().unhide('alice', 'bob');
    expect(useHiddenMembersStore.getState().hiddenByAccount.alice).toEqual(['carol']);
  });

  it('unhiding a username that was never hidden is a no-op', () => {
    useHiddenMembersStore.getState().unhide('alice', 'bob');
    expect(useHiddenMembersStore.getState().hiddenByAccount.alice).toBeUndefined();
  });

  it('different accounts have independent hidden lists', () => {
    useHiddenMembersStore.getState().hide('alice', 'bob');
    useHiddenMembersStore.getState().hide('carol', 'dave');
    expect(useHiddenMembersStore.getState().hiddenByAccount).toEqual({
      alice: ['bob'],
      carol: ['dave'],
    });
  });

  it('hydrate loads a previously persisted map', async () => {
    const { getPref } = await import('../../platform/prefs.js');
    vi.mocked(getPref).mockResolvedValueOnce(JSON.stringify({ alice: ['bob'] }));
    await useHiddenMembersStore.getState().hydrate();
    expect(useHiddenMembersStore.getState().hiddenByAccount).toEqual({ alice: ['bob'] });
    expect(useHiddenMembersStore.getState().hydrated).toBe(true);
  });

  it('hydrate recovers to an empty, hydrated state on corrupt prefs', async () => {
    const { getPref } = await import('../../platform/prefs.js');
    vi.mocked(getPref).mockResolvedValueOnce('{not json');
    await useHiddenMembersStore.getState().hydrate();
    expect(useHiddenMembersStore.getState().hiddenByAccount).toEqual({});
    expect(useHiddenMembersStore.getState().hydrated).toBe(true);
  });
});
