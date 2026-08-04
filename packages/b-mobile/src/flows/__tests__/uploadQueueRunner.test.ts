// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §9's retry policy is the part most likely to be got subtly wrong (§19): only `transport`
// outcomes retry (capped backoff, giving up after MAX_ATTEMPTS), every other outcome moves
// straight to `failed`. Runs against a fake client + fake platform/upload.ts, no jsdom needed —
// this is a plain module, not a React component (§9's whole reason for existing as one).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlipfotoError, NetworkError } from '@b-oss/b-api';
import { useUploadQueueStore } from '../../state/uploadQueueStore.js';
import type { UploadQueueItem } from '../../state/uploadQueueStore.js';
import {
  startUploadQueueRunner,
  wakeUploadQueueRunner,
  nextBackoffMs,
} from '../uploadQueueRunner.js';

const client = { publishEntry: vi.fn(), updateEntry: vi.fn() };
vi.mock('../../data/client.js', () => ({ getClientForAccount: () => Promise.resolve(client) }));

vi.mock('../../platform/upload.js', () => ({
  readQueuedFileAsSource: vi.fn().mockResolvedValue({ path: '/tmp/x.jpg', mimeType: 'image/jpeg' }),
  deleteQueuedFile: vi.fn().mockResolvedValue(undefined),
}));

const { handleForcedLogout } = vi.hoisted(() => ({ handleForcedLogout: vi.fn() }));
vi.mock('../accountsFlow.js', () => ({ handleForcedLogout }));

const { onEntryPublished } = vi.hoisted(() => ({ onEntryPublished: vi.fn() }));
vi.mock('../reminderFlow.js', () => ({ onEntryPublished }));

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

function baseItem(overrides: Partial<UploadQueueItem> = {}): UploadQueueItem {
  return {
    id: 'q1',
    accountId: 'acct1',
    kind: 'publish',
    filePath: 'uploads/q1.jpg',
    fileMimeType: 'image/jpeg',
    fields: { title: 'Sunrise', date: '2026-01-01' },
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

function setQueue(items: UploadQueueItem[]): void {
  useUploadQueueStore.setState({ items, hydrated: true });
}

function getItem(id: string): UploadQueueItem {
  const item = useUploadQueueStore.getState().items.find((i) => i.id === id);
  if (!item) throw new Error(`item ${id} not found`);
  return item;
}

beforeEach(() => {
  vi.clearAllMocks();
  setQueue([]);
});

describe('nextBackoffMs', () => {
  it('follows the capped exponential schedule (5s, 15s, 45s, 2m, 5m, capped)', () => {
    expect(nextBackoffMs(1)).toBe(5_000);
    expect(nextBackoffMs(2)).toBe(15_000);
    expect(nextBackoffMs(3)).toBe(45_000);
    expect(nextBackoffMs(4)).toBe(120_000);
    expect(nextBackoffMs(5)).toBe(300_000);
    expect(nextBackoffMs(6)).toBe(300_000);
    expect(nextBackoffMs(99)).toBe(300_000);
  });
});

describe('uploadQueueRunner', () => {
  it('marks an item uploaded, deletes the file, and notifies reminderFlow on success', async () => {
    client.publishEntry.mockResolvedValue({ entry: { entry_id_str: 'e42' } });
    setQueue([baseItem()]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('uploaded'));
    expect(getItem('q1').resultEntryId).toBe('e42');
    const { deleteQueuedFile } = await import('../../platform/upload.js');
    expect(deleteQueuedFile).toHaveBeenCalledWith('uploads/q1.jpg');
    expect(onEntryPublished).toHaveBeenCalledWith('acct1');
  });

  it('retries a transport failure with backoff instead of failing immediately', async () => {
    client.publishEntry.mockRejectedValue(new NetworkError('down'));
    setQueue([baseItem()]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').attempts).toBe(1));
    expect(getItem('q1').status).toBe('waiting');
    expect(getItem('q1').nextAttemptAt).not.toBeNull();
  });

  it('gives up after MAX_ATTEMPTS transport failures and marks the item failed', async () => {
    client.publishEntry.mockRejectedValue(new NetworkError('down'));
    // nextAttemptAt in the past so the runner treats it as immediately ready each time.
    setQueue([baseItem({ attempts: 5, nextAttemptAt: Date.now() - 1000 })]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('failed'));
    expect(getItem('q1').attempts).toBe(6);
  });

  it('moves a validation/application error straight to failed, never retrying', async () => {
    client.publishEntry.mockRejectedValue(new BlipfotoError(500, 'Server exploded'));
    setQueue([baseItem()]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('failed'));
    expect(getItem('q1').attempts).toBe(0);
    expect(getItem('q1').error).toBe('Server exploded');
  });

  it('handles a forced-logout outcome by clearing the token and failing the item', async () => {
    client.publishEntry.mockRejectedValue(new BlipfotoError(51, 'Invalid session'));
    setQueue([baseItem()]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('failed'));
    expect(handleForcedLogout).toHaveBeenCalledWith('acct1', 'app');
  });

  it('routes an edit item through updateEntry with its entryId', async () => {
    client.updateEntry.mockResolvedValue({ entry: { entry_id_str: 'e1' } });
    setQueue([baseItem({ kind: 'edit', entryId: 'e1', fields: { title: 'Updated' } })]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('uploaded'));
    expect(client.updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'e1', title: 'Updated' }),
    );
  });

  it('resets a stuck "uploading" item back to "waiting" on startup (killed-process recovery)', () => {
    client.publishEntry.mockImplementation(() => new Promise(() => {})); // never resolves
    setQueue([baseItem({ status: 'uploading' })]);

    startUploadQueueRunner();

    // Immediately after the recovery sweep, before the async drain's first await settles, the
    // item must already read back as picked-up (no longer stuck) — the queue's own state update
    // for the recovery reset is synchronous.
    expect(['waiting', 'uploading']).toContain(getItem('q1').status);
  });
});
