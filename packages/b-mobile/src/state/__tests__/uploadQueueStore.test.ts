// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUploadQueueStore } from '../uploadQueueStore.js';
import type { UploadQueueItem } from '../uploadQueueStore.js';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

function item(overrides: Partial<UploadQueueItem> = {}): UploadQueueItem {
  return {
    id: 'q1',
    accountId: 'a1',
    kind: 'publish',
    filePath: 'uploads/q1.jpg',
    fileMimeType: 'image/jpeg',
    fields: {},
    status: 'waiting',
    attempts: 0,
    nextAttemptAt: null,
    error: null,
    displayTitle: 'Sunrise',
    createdAt: Date.now(),
    resultEntryId: null,
    ...overrides,
  };
}

beforeEach(() => {
  useUploadQueueStore.setState({ items: [], hydrated: true });
});

describe('uploadQueueStore', () => {
  it('enqueue adds an item; updateItem patches it', () => {
    useUploadQueueStore.getState().enqueue(item());
    expect(useUploadQueueStore.getState().items).toHaveLength(1);

    useUploadQueueStore.getState().updateItem('q1', { status: 'uploading' });
    expect(useUploadQueueStore.getState().items[0].status).toBe('uploading');
  });

  it('removeItem drops the item', () => {
    useUploadQueueStore.getState().enqueue(item());
    useUploadQueueStore.getState().removeItem('q1');
    expect(useUploadQueueStore.getState().items).toHaveLength(0);
  });

  it("cancelForAccount removes only that account's waiting/uploading items, returning what it cancelled", () => {
    useUploadQueueStore.getState().enqueue(item({ id: 'q1', accountId: 'a1', status: 'waiting' }));
    useUploadQueueStore
      .getState()
      .enqueue(item({ id: 'q2', accountId: 'a1', status: 'uploading' }));
    useUploadQueueStore.getState().enqueue(item({ id: 'q3', accountId: 'a1', status: 'uploaded' }));
    useUploadQueueStore.getState().enqueue(item({ id: 'q4', accountId: 'a2', status: 'waiting' }));

    const cancelled = useUploadQueueStore.getState().cancelForAccount('a1');

    expect(cancelled.map((i) => i.id).sort()).toEqual(['q1', 'q2']);
    const remainingIds = useUploadQueueStore
      .getState()
      .items.map((i) => i.id)
      .sort();
    expect(remainingIds).toEqual(['q3', 'q4']);
  });

  it('cancelForAccount is a no-op (empty result) when the account has nothing cancellable', () => {
    useUploadQueueStore.getState().enqueue(item({ id: 'q1', accountId: 'a1', status: 'uploaded' }));
    expect(useUploadQueueStore.getState().cancelForAccount('a1')).toEqual([]);
    expect(useUploadQueueStore.getState().items).toHaveLength(1);
  });
});
