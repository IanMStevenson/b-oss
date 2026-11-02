// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-12/FLW-13's "Publish"/"Save" action (§9): sends a composeDraftStore draft to Blipfoto and
// waits for the answer. Shared by SCR-10 (publish) and SCR-13 (edit) — same draft shape, `mode`
// picks publishEntry or updateEntry. The caller owns the progress state and any failure: a thrown
// error leaves the draft intact for a retry.

import type { PublishEntryParams, UpdateEntryParams } from '@b-oss/b-api';
import { getClientForAccount } from '../data/client.js';
import { gmtOffsetMinutes } from '../data/dates.js';
import { thumbnailCropToField } from '../data/imageCrop.js';
import { photoToFileSource } from '../platform/upload.js';
import type { ComposeDraft } from '../state/composeDraftStore.js';
import { describeError, describeUploadError, mapApiError } from '../data/errors.js';
import { handleForcedLogout } from './accountsFlow.js';
import { onEntryPublished } from './reminderFlow.js';

type PublishFields = Omit<PublishEntryParams, 'image'>;
type EditFields = Omit<UpdateEntryParams, 'image' | 'entryId'>;

/** Sends the draft; resolves with the entry id (string form) once Blipfoto has accepted it. */
export async function submitDraft(draft: ComposeDraft): Promise<string> {
  // An entry Blipfoto only partly lets you edit (actions.edit === 2) takes tags and location only;
  // the rest is dropped here rather than sent to be silently ignored.
  const tagsAndLocationOnly = draft.mode === 'edit' && draft.editLevel === 2;
  const photo = tagsAndLocationOnly ? null : draft.photo;

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

  const fields: PublishFields | EditFields =
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

  const client = await getClientForAccount(draft.accountId);
  const image = photo ? await photoToFileSource(photo) : undefined;

  const entryId =
    draft.mode === 'publish'
      ? (await client.publishEntry({ ...(fields as PublishFields), image: image! })).entry
          .entry_id_str
      : (await client.updateEntry({ entryId: draft.entryId!, ...fields, image })).entry
          .entry_id_str;

  // Either counts as "published through the app today" for that account's reminder.
  onEntryPublished(draft.accountId);
  return entryId;
}

/** The message for a failed submitDraft, with the real cause where there is one (b-oss#318). A
 * rejected sign-in also signs that account out, as any other forced logout does. */
export function describeSubmitError(err: unknown, accountId: string, fallback: string): string {
  const outcome = mapApiError(err);
  if (outcome.kind === 'forced-logout') {
    handleForcedLogout(accountId, 'app');
    return describeError(outcome, 'Signed out — please sign in again.');
  }
  return describeUploadError(err, fallback);
}
