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
  // An entry Blipfoto only partly lets you edit (actions.edit === 2) takes tags and location only;
  // the rest is dropped here rather than sent to be silently ignored.
  const tagsAndLocationOnly = draft.mode === 'edit' && draft.editLevel === 2;
  const photo = tagsAndLocationOnly ? null : draft.photo;
  const filePath = photo ? await copyPhotoToAppStorage(photo, id) : null;

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
    title: tagsAndLocationOnly ? undefined : draft.title.trim() || undefined,
    tags: draft.tags.trim() || undefined,
    description: tagsAndLocationOnly ? undefined : draft.description || undefined,
    lat: draft.location ? draft.location.lat : undefined,
    lon: draft.location ? draft.location.lon : undefined,
    // The position is sent whether or not it is shown, so the server holds it for a later "Add
    // to map"; display_location carries the map on/off choice (a PUT without it leaves it as is).
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
        // A thumbnail selection only means something alongside a replacement photo.
        {
          ...commonFields,
          thumbnail_crop:
            photo && draft.thumbnailCrop ? thumbnailCropToField(draft.thumbnailCrop) : undefined,
        };

  const item: UploadQueueItem = {
    id,
    accountId: draft.accountId,
    kind: draft.mode === 'publish' ? 'publish' : 'edit',
    entryId: draft.entryId,
    filePath,
    fileMimeType: photo?.mimeType ?? null,
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
