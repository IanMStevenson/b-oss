// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// BEHAVIOUR.md, "Hidden members" — the list is installation-wide and device-local. One test per
// rule stated there, same density approach as accountsFlow.test.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

import { useHiddenMembersStore, useHiddenMembers } from '../hiddenMembersStore.js';
import { useAccountsStore } from '../accountsStore.js';

beforeEach(() => {
  useHiddenMembersStore.setState({ hidden: [], hydrated: false });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
});

describe('hiddenMembersStore', () => {
  it('hide adds a username, with nobody signed in', () => {
    useHiddenMembersStore.getState().hide('bob');
    expect(useHiddenMembersStore.getState().hidden).toEqual(['bob']);
  });

  it('hiding the same username twice does not duplicate it', () => {
    useHiddenMembersStore.getState().hide('bob');
    useHiddenMembersStore.getState().hide('bob');
    expect(useHiddenMembersStore.getState().hidden).toEqual(['bob']);
  });

  it('unhide removes exactly that username, leaving the rest', () => {
    useHiddenMembersStore.getState().hide('bob');
    useHiddenMembersStore.getState().hide('carol');
    useHiddenMembersStore.getState().unhide('bob');
    expect(useHiddenMembersStore.getState().hidden).toEqual(['carol']);
  });

  it('unhiding a username that was never hidden is a no-op', () => {
    useHiddenMembersStore.getState().unhide('bob');
    expect(useHiddenMembersStore.getState().hidden).toEqual([]);
  });

  it('the list is the same whichever account is active, or with none', () => {
    useHiddenMembersStore.getState().hide('bob');
    const { result, rerender } = renderHook(() => useHiddenMembers());
    expect(result.current).toEqual(['bob']);
    useAccountsStore.setState({ activeAccountId: 'a1' });
    rerender();
    expect(result.current).toEqual(['bob']);
  });

  it('hydrate loads a previously persisted list', async () => {
    const { getPref } = await import('../../platform/prefs.js');
    vi.mocked(getPref).mockResolvedValueOnce(JSON.stringify(['bob']));
    await useHiddenMembersStore.getState().hydrate();
    expect(useHiddenMembersStore.getState().hidden).toEqual(['bob']);
    expect(useHiddenMembersStore.getState().hydrated).toBe(true);
  });

  it('hydrate merges the older per-account format into one list', async () => {
    const { getPref } = await import('../../platform/prefs.js');
    vi.mocked(getPref).mockResolvedValueOnce(
      JSON.stringify({ a1: ['bob', 'carol'], a2: ['carol', 'dave'] }),
    );
    await useHiddenMembersStore.getState().hydrate();
    expect(useHiddenMembersStore.getState().hidden).toEqual(['bob', 'carol', 'dave']);
  });

  it('hydrate recovers to an empty, hydrated state on corrupt prefs', async () => {
    const { getPref } = await import('../../platform/prefs.js');
    vi.mocked(getPref).mockResolvedValueOnce('{not json');
    await useHiddenMembersStore.getState().hydrate();
    expect(useHiddenMembersStore.getState().hidden).toEqual([]);
    expect(useHiddenMembersStore.getState().hydrated).toBe(true);
  });

  it('useHiddenMembers returns a referentially stable empty array when nobody is hidden', () => {
    // Regression: an unstable `[]` on every selector call trips useSyncExternalStore's
    // "getSnapshot should be cached" infinite-render-loop guard.
    const { result, rerender } = renderHook(() => useHiddenMembers());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current).toEqual([]);
  });
});
