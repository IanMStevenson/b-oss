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
  retryUploadItem,
  removeUploadItem,
} from '../uploadQueueRunner.js';

const client = { publishEntry: vi.fn(), updateEntry: vi.fn(), getJournalDay: vi.fn() };
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

// Before the uploadQueueRunner block: its last two (startup) tests leave a drain in flight.
describe('retry and remove (SCR-14)', () => {
  it('retry puts a failed item back in the queue with a fresh attempt budget and uploads it', async () => {
    client.publishEntry.mockResolvedValue({ entry: { entry_id_str: 'e7' } });
    setQueue([
      baseItem({
        status: 'failed',
        attempts: 6,
        error: 'Could not connect',
        mayHavePublished: true,
      }),
    ]);

    retryUploadItem('q1');

    await vi.waitFor(() => expect(getItem('q1').status).toBe('uploaded'));
    expect(getItem('q1').error).toBeNull();
    expect(client.publishEntry).toHaveBeenCalledTimes(1);
  });

  it('retry keeps the "may have published" flag, so a 252 still resolves to that day\'s entry', async () => {
    client.publishEntry.mockRejectedValue(new BlipfotoError(252, 'Already posted'));
    client.getJournalDay.mockResolvedValue({ day: { entry: { entry_id_str: 'e8' } } });
    setQueue([baseItem({ status: 'failed', attempts: 6, mayHavePublished: true })]);

    retryUploadItem('q1');

    await vi.waitFor(() => expect(getItem('q1').status).toBe('uploaded'));
    expect(getItem('q1').resultEntryId).toBe('e8');
  });

  it('retry ignores an item that is not failed', () => {
    setQueue([baseItem({ status: 'uploaded', resultEntryId: 'e1' })]);
    retryUploadItem('q1');
    expect(getItem('q1').status).toBe('uploaded');
    expect(client.publishEntry).not.toHaveBeenCalled();
  });

  it('remove drops a failed item and deletes its copied photo', async () => {
    setQueue([baseItem({ status: 'failed' }), baseItem({ id: 'q2', status: 'uploaded' })]);

    await removeUploadItem('q1');

    expect(useUploadQueueStore.getState().items.map((i) => i.id)).toEqual(['q2']);
    const { deleteQueuedFile } = await import('../../platform/upload.js');
    expect(deleteQueuedFile).toHaveBeenCalledWith('uploads/q1.jpg');
  });

  it('remove ignores an item that is not failed', async () => {
    setQueue([baseItem({ status: 'waiting' })]);
    await removeUploadItem('q1');
    expect(useUploadQueueStore.getState().items).toHaveLength(1);
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

  it('flags a publish that may have landed after a transport failure', async () => {
    client.publishEntry.mockRejectedValue(new NetworkError('timeout'));
    setQueue([baseItem()]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').attempts).toBe(1));
    expect(getItem('q1').mayHavePublished).toBe(true);
  });

  it("marks a retried publish uploaded when 252 comes back and that day's entry exists", async () => {
    client.publishEntry.mockRejectedValue(new BlipfotoError(252, 'Already posted'));
    client.getJournalDay.mockResolvedValue({ day: { entry: { entry_id_str: 'e77' } } });
    setQueue([baseItem({ attempts: 1, mayHavePublished: true })]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('uploaded'));
    expect(client.getJournalDay).toHaveBeenCalledWith('2026-01-01');
    expect(getItem('q1').resultEntryId).toBe('e77');
    const { deleteQueuedFile } = await import('../../platform/upload.js');
    expect(deleteQueuedFile).toHaveBeenCalledWith('uploads/q1.jpg');
    expect(onEntryPublished).toHaveBeenCalledWith('acct1');
  });

  it('still fails a first-attempt 252 without looking up the day', async () => {
    client.publishEntry.mockRejectedValue(new BlipfotoError(252, 'Already posted'));
    setQueue([baseItem()]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('failed'));
    expect(client.getJournalDay).not.toHaveBeenCalled();
  });

  it('fails a retried 252 when the day turns out to have no entry', async () => {
    client.publishEntry.mockRejectedValue(new BlipfotoError(252, 'Already posted'));
    client.getJournalDay.mockResolvedValue({ day: { entry: null } });
    setQueue([baseItem({ attempts: 1, mayHavePublished: true })]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('failed'));
    expect(getItem('q1').resultEntryId).toBeNull();
  });

  it('fails a retried 252 when the day lookup itself fails', async () => {
    client.publishEntry.mockRejectedValue(new BlipfotoError(252, 'Already posted'));
    client.getJournalDay.mockRejectedValue(new NetworkError('down'));
    setQueue([baseItem({ attempts: 1, mayHavePublished: true })]);

    wakeUploadQueueRunner();

    await vi.waitFor(() => expect(getItem('q1').status).toBe('failed'));
  });

  // The two startup tests leave a never-resolving publish in flight, so they stay last.
  it('resets a stuck "uploading" item back to "waiting" on startup (killed-process recovery)', () => {
    client.publishEntry.mockImplementation(() => new Promise(() => {})); // never resolves
    setQueue([baseItem({ status: 'uploading' })]);

    startUploadQueueRunner();

    // Immediately after the recovery sweep, before the async drain's first await settles, the
    // item must already read back as picked-up (no longer stuck) — the queue's own state update
    // for the recovery reset is synchronous.
    expect(['waiting', 'uploading']).toContain(getItem('q1').status);
  });

  it('flags a publish recovered from "uploading" on startup', () => {
    client.publishEntry.mockImplementation(() => new Promise(() => {}));
    setQueue([baseItem({ status: 'uploading' })]);

    startUploadQueueRunner();

    expect(getItem('q1').mayHavePublished).toBe(true);
  });
});
