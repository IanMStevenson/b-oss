// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The durable upload queue (§9). Pure state here — flows/uploadQueueRunner.ts (not a React
// component; §9 is explicit the runner has non-React consumers) is what actually drains it.
// Persisted to prefs as plain JSON (the queued photos themselves live as files in app storage via
// platform/upload.ts, referenced by `filePath`, not duplicated here) — SCR-14 must be correct
// after leaving and returning, and a killed/relaunched process must recover a stuck `uploading`
// item (handled by the runner's own startup recovery, not this store).

import { create } from 'zustand';
import { getPref, setPref } from '../platform/prefs.js';
import type { PublishEntryParams, UpdateEntryParams } from '@b-oss/b-api';

export type UploadStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed';

export type PublishQueueFields = Omit<PublishEntryParams, 'image'>;
export type EditQueueFields = Omit<UpdateEntryParams, 'image' | 'entryId'>;

export interface UploadQueueItem {
  id: string;
  accountId: string;
  kind: 'publish' | 'edit';
  /** kind: 'edit' only. */
  entryId?: string;
  /** Relative to Directory.Data (platform/upload.ts's copyPhotoToAppStorage) — null for an
   * edit-details-only item (no new photo chosen). */
  filePath: string | null;
  fileMimeType: string | null;
  fields: PublishQueueFields | EditQueueFields;
  status: UploadStatus;
  attempts: number;
  /** epoch ms; null means "ready now" (no backoff pending). */
  nextAttemptAt: number | null;
  error: string | null;
  /** SCR-14's list title — carried directly rather than looked up, so the list is correct even
   * before the item has ever successfully contacted the server. */
  displayTitle: string;
  createdAt: number;
  /** Set on success — SCR-14's "tap a successful item -> open its entry". */
  resultEntryId: string | null;
}

const PREFS_KEY = 'b-mobile:upload-queue';

interface UploadQueueState {
  hydrated: boolean;
  items: UploadQueueItem[];
  hydrate: () => Promise<void>;
  enqueue: (item: UploadQueueItem) => void;
  updateItem: (id: string, patch: Partial<UploadQueueItem>) => void;
  removeItem: (id: string) => void;
  /** rules.md/§9: in-flight work using a removed account's token is cancelled, not left running. */
  cancelForAccount: (accountId: string) => UploadQueueItem[];
}

function persist(items: UploadQueueItem[]): void {
  void setPref(PREFS_KEY, JSON.stringify(items));
}

export const useUploadQueueStore = create<UploadQueueState>((set, get) => ({
  hydrated: false,
  items: [],

  hydrate: async () => {
    const raw = await getPref(PREFS_KEY);
    if (raw) {
      try {
        set({ items: JSON.parse(raw) as UploadQueueItem[], hydrated: true });
        return;
      } catch {
        // Corrupt prefs — fall through to an empty, hydrated state rather than crash launch.
      }
    }
    set({ hydrated: true });
  },

  enqueue: (item) => {
    const items = [...get().items, item];
    persist(items);
    set({ items });
  },

  updateItem: (id, patch) => {
    const items = get().items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    persist(items);
    set({ items });
  },

  removeItem: (id) => {
    const items = get().items.filter((i) => i.id !== id);
    persist(items);
    set({ items });
  },

  cancelForAccount: (accountId) => {
    const cancelled = get().items.filter(
      (i) => i.accountId === accountId && (i.status === 'waiting' || i.status === 'uploading'),
    );
    if (cancelled.length === 0) return [];
    const items = get().items.filter((i) => !cancelled.includes(i));
    persist(items);
    set({ items });
    return cancelled;
  },
}));
