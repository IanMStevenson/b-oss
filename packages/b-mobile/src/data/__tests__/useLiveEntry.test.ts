// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { useLiveEntry } from '../useLiveEntry.js';
import { useAccountsStore } from '../../state/accountsStore.js';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const fetchEntry = vi.fn<(id: string) => Promise<unknown>>();
vi.mock('../entries.js', () => ({ fetchEntry: (id: string) => fetchEntry(id) }));

afterEach(cleanup);

beforeEach(() => {
  fetchEntry.mockReset().mockResolvedValue({
    entry: { entry_id: 'e1' },
    prevEntryId: null,
    nextEntryId: null,
  });
  useAccountsStore.setState({ accounts: [], activeAccountId: 'a1' });
});

describe('useLiveEntry', () => {
  it('reloads the entry when the active account changes, since its actions are per-viewer (b-oss#219)', async () => {
    renderHook(() => useLiveEntry('e1'));
    await waitFor(() => expect(fetchEntry).toHaveBeenCalledTimes(1));

    act(() => useAccountsStore.setState({ activeAccountId: 'a2' }));
    await waitFor(() => expect(fetchEntry).toHaveBeenCalledTimes(2));
  });

  it('does not refetch on an unrelated re-render', async () => {
    const { rerender } = renderHook(() => useLiveEntry('e1'));
    await waitFor(() => expect(fetchEntry).toHaveBeenCalledTimes(1));
    rerender();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchEntry).toHaveBeenCalledTimes(1);
  });
});
