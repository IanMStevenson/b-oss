// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-12/FLW-13's "Upload"/"Save" action: turns a composeDraftStore draft into a durable
// uploadQueueStore item (§9) and wakes the runner. Shared by SCR-10 (publish) and SCR-13 (edit) —
// same draft shape, `mode` picks the queue item's `kind` and which b-api params type applies.

import { randomId } from '../data/id.js';
import { gmtOffsetMinutes } from '../data/dates.js';
import { thumbnailCropToField } from '../data/imageCrop.js';
import { copyPhotoToAppStorage } from '../platform/upload.js';
import { useUploadQueueStore } from '../state/uploadQueueStore.js';
import type {
  UploadQueueItem,
  PublishQueueFields,
  EditQueueFields,
} from '../state/uploadQueueStore.js';
import { wakeUploadQueueRunner } from './uploadQueueRunner.js';
import type { ComposeDraft } from '../state/composeDraftStore.js';

export async function enqueueDraft(draft: ComposeDraft): Promise<string> {
  const id = randomId();
  const filePath = draft.photo ? await copyPhotoToAppStorage(draft.photo, id) : null;

  // Explicitly typed (rather than inferred) so `display_location` contextually types as the
  // `0 | 1 | undefined` both PublishQueueFields and EditQueueFields expect, without a cast.
  const commonFields: {
    title?: string;
    tags?: string;
    description?: string;
    lat?: number;
    lon?: number;
    display_location?: 0 | 1;
  } = {
    title: draft.title.trim() || undefined,
    tags: draft.tags.trim() || undefined,
    description: draft.description || undefined,
    lat: draft.location ? draft.location.lat : undefined,
    lon: draft.location ? draft.location.lon : undefined,
    display_location: draft.location ? (draft.displayLocation ? 1 : 0) : undefined,
  };

  const fields: PublishQueueFields | EditQueueFields =
    draft.mode === 'publish'
      ? {
          ...commonFields,
          date: draft.date,
          thumbnail_crop: draft.thumbnailCrop
            ? thumbnailCropToField(draft.thumbnailCrop)
            : undefined,
          gmt_offset: gmtOffsetMinutes(),
        }
      : // SCR-13 has no date field — the draft's `date` is carried only for display, never sent.
        commonFields;

  const item: UploadQueueItem = {
    id,
    accountId: draft.accountId,
    kind: draft.mode === 'publish' ? 'publish' : 'edit',
    entryId: draft.entryId,
    filePath,
    fileMimeType: draft.photo?.mimeType ?? null,
    fields,
    status: 'waiting',
    attempts: 0,
    nextAttemptAt: null,
    error: null,
    displayTitle: draft.title.trim() || draft.date,
    createdAt: Date.now(),
    resultEntryId: null,
  };

  useUploadQueueStore.getState().enqueue(item);
  wakeUploadQueueRunner();
  return id;
}
