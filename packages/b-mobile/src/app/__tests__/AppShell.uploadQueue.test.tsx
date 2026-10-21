// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#342 — the upload queue must survive a process restart. AppShell has to load the persisted
// queue before starting the runner, so the runner's launch recovery (a stuck `uploading` item back
// to `waiting`) sees the real items rather than an empty, not-yet-hydrated store.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { AppShell } from '../AppShell.js';
import { useUploadQueueStore } from '../../state/uploadQueueStore.js';
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

// Records what the runner would see at the moment AppShell starts it, without running uploads.
const seenAtStart: UploadQueueItem[][] = [];
vi.mock('../../flows/uploadQueueRunner.js', () => ({
  startUploadQueueRunner: () => {
    seenAtStart.push(useUploadQueueStore.getState().items);
  },
  wakeUploadQueueRunner: vi.fn(),
}));

function item(id: string, overrides: Partial<UploadQueueItem> = {}): UploadQueueItem {
  return {
    id,
    accountId: 'a1',
    kind: 'publish',
    filePath: null,
    fileMimeType: null,
    fields: {},
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

afterEach(() => {
  cleanup();
  prefs.clear();
  seenAtStart.length = 0;
  useUploadQueueStore.setState({ items: [], hydrated: false });
});

describe('AppShell upload queue at launch (b-oss#342)', () => {
  it('loads the persisted queue, then starts the runner with it', async () => {
    const persisted = [item('q1'), item('q2', { status: 'uploading' })];
    prefs.set('b-mobile:upload-queue', JSON.stringify(persisted));

    render(<AppShell />);

    await waitFor(() => expect(useUploadQueueStore.getState().hydrated).toBe(true));
    expect(useUploadQueueStore.getState().items.map((i) => i.id)).toEqual(['q1', 'q2']);
    await waitFor(() => expect(seenAtStart).toHaveLength(1));
    expect(seenAtStart[0].map((i) => i.id)).toEqual(['q1', 'q2']);
  });
});
