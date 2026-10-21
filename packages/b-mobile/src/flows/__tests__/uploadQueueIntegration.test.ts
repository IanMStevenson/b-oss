// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#330 item 2 — the upload queue end to end, rather than one outcome at a time: the real
// store (persisting to an in-memory prefs backend), the real runner and the real mapApiError,
// driven on fake timers across backoff wake-ups, a simulated process kill/relaunch, a token
// expiring mid-queue, and 413/429 responses. Only the b-api client, the platform file ops and the
// account/reminder side effects are faked. (The 252 "already posted" recovery is covered by
// uploadQueueRunner.test.ts, not repeated here.)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadQueueItem } from '../../state/uploadQueueStore.js';

const prefs = new Map<string, string>();
vi.mock('../../platform/prefs.js', () => ({
  getPref: (k: string) => Promise.resolve(prefs.get(k) ?? null),
  setPref: (k: string, v: string) => {
    prefs.set(k, v);
    return Promise.resolve();
  },
  deletePref: (k: string) => {
    prefs.delete(k);
    return Promise.resolve();
  },
}));

type PublishParams = { title: string };
const client = {
  publishEntry: vi.fn<(p: PublishParams) => Promise<{ entry: { entry_id_str: string } }>>(),
  updateEntry: vi.fn(),
};
vi.mock('../../data/client.js', () => ({ getClientForAccount: () => Promise.resolve(client) }));

const deleteQueuedFile = vi.fn<(p: string) => Promise<void>>().mockResolvedValue(undefined);
vi.mock('../../platform/upload.js', () => ({
  readQueuedFileAsSource: vi.fn().mockResolvedValue({ path: '/tmp/x.jpg', mimeType: 'image/jpeg' }),
  deleteQueuedFile: (p: string) => deleteQueuedFile(p),
}));

const handleForcedLogout = vi.fn<(...a: unknown[]) => void>();
vi.mock('../accountsFlow.js', () => ({
  handleForcedLogout: (...a: unknown[]) => handleForcedLogout(...a),
}));
const onEntryPublished = vi.fn<(...a: unknown[]) => void>();
vi.mock('../reminderFlow.js', () => ({
  onEntryPublished: (...a: unknown[]) => onEntryPublished(...a),
}));

function item(id: string, overrides: Partial<UploadQueueItem> = {}): UploadQueueItem {
  return {
    id,
    accountId: 'acct1',
    kind: 'publish',
    filePath: `uploads/${id}.jpg`,
    fileMimeType: 'image/jpeg',
    fields: { title: id, date: '2026-01-01' },
    status: 'waiting',
    attempts: 0,
    nextAttemptAt: null,
    error: null,
    displayTitle: id,
    createdAt: 0,
    resultEntryId: null,
    ...overrides,
  };
}

type Api = typeof import('@b-oss/b-api');

function httpError(api: Api, status: number, body = '') {
  return new api.HttpError({
    method: 'POST',
    url: 'https://api.blipfoto.com/4/entry',
    status,
    statusText: '',
    responseHeaders: {},
    responseBody: body,
  });
}

/** A fresh "process": new module instances for the store and runner, state read back from prefs.
 * The error classes must come from the same module graph as the runner (mapApiError uses
 * instanceof), hence `api` is re-imported here rather than at the top of the file. */
async function launchApp() {
  vi.resetModules();
  const { useUploadQueueStore } = await import('../../state/uploadQueueStore.js');
  const runner = await import('../uploadQueueRunner.js');
  const api = await import('@b-oss/b-api');
  await useUploadQueueStore.getState().hydrate();
  const byId = (id: string) => useUploadQueueStore.getState().items.find((i) => i.id === id)!;
  return { store: useUploadQueueStore, runner, byId, api };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
  prefs.clear();
  vi.clearAllMocks();
  client.publishEntry.mockReset();
  client.updateEntry.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('upload queue integration', () => {
  it('drains serially, retries a transport failure on the backoff timer without any new wake, then continues', async () => {
    const app = await launchApp();
    const order: string[] = [];
    let aCalls = 0;
    client.publishEntry.mockImplementation((p: PublishParams) => {
      order.push(p.title);
      if (p.title === 'a' && ++aCalls === 1) throw new app.api.NetworkError('offline');
      return Promise.resolve({ entry: { entry_id_str: `id-${p.title}` } });
    });
    app.store.getState().enqueue(item('a'));
    app.store.getState().enqueue(item('b'));

    app.runner.wakeUploadQueueRunner();
    await vi.advanceTimersByTimeAsync(0);

    // a failed once and is parked until its 5s backoff; b is not blocked behind it.
    expect(app.byId('a')).toMatchObject({ status: 'waiting', attempts: 1 });
    expect(app.byId('a').nextAttemptAt).toBe(Date.now() + 5_000);
    expect(app.byId('b')).toMatchObject({ status: 'uploaded', resultEntryId: 'id-b' });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(app.byId('a').status).toBe('waiting');
    await vi.advanceTimersByTimeAsync(1);

    expect(app.byId('a')).toMatchObject({ status: 'uploaded', resultEntryId: 'id-a' });
    expect(order).toEqual(['a', 'b', 'a']);
    expect(deleteQueuedFile).toHaveBeenCalledWith('uploads/a.jpg');
    expect(deleteQueuedFile).toHaveBeenCalledWith('uploads/b.jpg');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up after six transport failures along the whole backoff schedule, keeping the file for a manual retry', async () => {
    const app = await launchApp();
    client.publishEntry.mockRejectedValue(new app.api.NetworkError('offline'));
    app.store.getState().enqueue(item('a'));

    app.runner.wakeUploadQueueRunner();
    await vi.advanceTimersByTimeAsync(0);
    for (const wait of [5_000, 15_000, 45_000, 120_000, 300_000]) {
      expect(app.byId('a').status).toBe('waiting');
      await vi.advanceTimersByTimeAsync(wait);
    }

    expect(client.publishEntry).toHaveBeenCalledTimes(6);
    expect(app.byId('a')).toMatchObject({ status: 'failed', attempts: 6 });
    expect(deleteQueuedFile).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('app kill and resume', () => {
    it('recovers an item killed mid-upload from persisted state and uploads it exactly once more', async () => {
      const first = await launchApp();
      // The upload that never returns: the process dies while the request is in flight.
      client.publishEntry.mockReturnValueOnce(new Promise(() => {}));
      first.store.getState().enqueue(item('a'));
      first.store.getState().enqueue(item('b'));
      first.runner.wakeUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(0);
      expect(first.byId('a').status).toBe('uploading');
      // b is blocked behind the in-flight a (serial).
      expect(client.publishEntry).toHaveBeenCalledTimes(1);

      // Relaunch: nothing survives but prefs.
      client.publishEntry.mockImplementation((p: PublishParams) =>
        Promise.resolve({ entry: { entry_id_str: `id-${p.title}` } }),
      );
      const second = await launchApp();
      expect(second.byId('a').status).toBe('uploading'); // as persisted by the dead process
      second.runner.startUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(0);

      expect(second.byId('a')).toMatchObject({ status: 'uploaded', resultEntryId: 'id-a' });
      expect(second.byId('b')).toMatchObject({ status: 'uploaded', resultEntryId: 'id-b' });
      expect(client.publishEntry).toHaveBeenCalledTimes(3); // 1 dead + a + b
    });

    it('honours a persisted backoff after relaunch: waits out the remaining time, not a fresh 5s', async () => {
      const first = await launchApp();
      client.publishEntry.mockRejectedValueOnce(new first.api.NetworkError('offline'));
      first.store.getState().enqueue(item('a'));
      first.runner.wakeUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(0);
      const due = first.byId('a').nextAttemptAt!;

      await vi.advanceTimersByTimeAsync(3_000); // 2s of backoff left when the app dies
      client.publishEntry.mockResolvedValue({ entry: { entry_id_str: 'id-a' } });
      const second = await launchApp();
      second.runner.startUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(0);
      expect(second.byId('a')).toMatchObject({ status: 'waiting', attempts: 1 });
      expect(client.publishEntry).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(due - Date.now());
      expect(second.byId('a').status).toBe('uploaded');
    });

    it('a backoff that elapsed while the app was dead is retried immediately on launch', async () => {
      const first = await launchApp();
      client.publishEntry.mockRejectedValueOnce(new first.api.NetworkError('offline'));
      first.store.getState().enqueue(item('a'));
      first.runner.wakeUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(0);

      vi.setSystemTime(Date.now() + 60 * 60_000); // phone off for an hour
      client.publishEntry.mockResolvedValue({ entry: { entry_id_str: 'id-a' } });
      const second = await launchApp();
      second.runner.startUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(0);
      expect(second.byId('a').status).toBe('uploaded');
    });
  });

  describe('token expiry mid-queue', () => {
    it("fails only the expired account's items, forces that account out once per item, and keeps draining others", async () => {
      const app = await launchApp();
      client.publishEntry.mockImplementation((p: PublishParams) => {
        if (p.title === 'b' || p.title === 'd')
          throw new app.api.BlipfotoError(51, 'Invalid session');
        return Promise.resolve({ entry: { entry_id_str: `id-${p.title}` } });
      });
      app.store.getState().enqueue(item('a'));
      app.store.getState().enqueue(item('b'));
      app.store.getState().enqueue(item('c', { accountId: 'acct2' }));
      app.store.getState().enqueue(item('d'));

      app.runner.wakeUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(0);

      expect(app.byId('a').status).toBe('uploaded');
      expect(app.byId('b')).toMatchObject({
        status: 'failed',
        error: 'Signed out — please sign in again and retry.',
      });
      expect(app.byId('c').status).toBe('uploaded');
      expect(app.byId('d').status).toBe('failed');
      expect(handleForcedLogout).toHaveBeenCalledTimes(2);
      expect(handleForcedLogout).toHaveBeenCalledWith('acct1', 'app');
      expect(handleForcedLogout).not.toHaveBeenCalledWith('acct2', expect.anything());
      // Never retried (a dead token can't recover by waiting), and the photos are kept.
      expect(client.publishEntry).toHaveBeenCalledTimes(4);
      expect(deleteQueuedFile).not.toHaveBeenCalledWith('uploads/b.jpg');
      expect(onEntryPublished).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('413 and 429', () => {
    it('413 Payload Too Large fails straight away without retrying, and later items still go', async () => {
      const app = await launchApp();
      client.publishEntry.mockImplementation((p: PublishParams) => {
        if (p.title === 'big')
          throw httpError(app.api, 413, '<html>Request Entity Too Large</html>');
        return Promise.resolve({ entry: { entry_id_str: 'ok' } });
      });
      app.store.getState().enqueue(item('big'));
      app.store.getState().enqueue(item('small'));

      app.runner.wakeUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(0);

      expect(app.byId('big')).toMatchObject({ status: 'failed', attempts: 0 });
      expect(app.byId('big').error).toContain('413');
      expect(app.byId('small').status).toBe('uploaded');
      expect(client.publishEntry).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(client.publishEntry).toHaveBeenCalledTimes(2);
    });

    it('a bare HTTP 429 is not treated as transport: it fails with its status, no automatic retry', async () => {
      const app = await launchApp();
      client.publishEntry.mockRejectedValue(httpError(app.api, 429));
      app.store.getState().enqueue(item('a'));

      app.runner.wakeUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(client.publishEntry).toHaveBeenCalledTimes(1);
      expect(app.byId('a')).toMatchObject({ status: 'failed' });
      expect(app.byId('a').error).toContain('429');
    });

    it('Blipfoto\'s own rate-limit error (code 11) fails with the "wait a moment" copy, no retry', async () => {
      const app = await launchApp();
      client.publishEntry.mockRejectedValue(new app.api.BlipfotoError(11, 'Rate limit'));
      app.store.getState().enqueue(item('a'));

      app.runner.wakeUploadQueueRunner();
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(client.publishEntry).toHaveBeenCalledTimes(1);
      expect(app.byId('a')).toMatchObject({
        status: 'failed',
        error: 'Please wait a moment and try again.',
      });
    });
  });
});
