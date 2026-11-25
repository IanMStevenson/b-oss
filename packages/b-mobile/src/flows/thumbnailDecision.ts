// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Replacing an entry's photo AND choosing its thumbnail (b-oss#1062). Blipfoto's API accepts the
// thumbnail selection when an entry is published, but ignores it when an entry's photo is replaced:
// the new photo gets the default thumbnail whatever `thumbnail_crop` the PUT carries (the website's
// own edit page does apply it). So that edit cannot be made honestly through the API, and the member
// decides what to do with it (components/ReplaceThumbnailDecision.tsx):
//   1. carry on with the default thumbnail (the selection is dropped);
//   2. delete the entry and post the edits as a new one (the only way to get the selection applied,
//      at the cost of everything attached to the old entry);
//   3. cancel the edits.

import { deleteEntry } from '../data/entries.js';
import { thumbnailWasEdited } from '../data/imageCrop.js';
import type { ComposeDraft } from '../state/composeDraftStore.js';
import { submitDraft } from './composeFlow.js';

/** Whether saving this draft would send a thumbnail selection with a replacement photo, which the
 * API ignores: an edit with a new photo whose selection the member changed. */
export function needsThumbnailDecision(draft: ComposeDraft): boolean {
  if (draft.mode !== 'edit' || !draft.photo) return false;
  // An entry the API lets only tags and location be changed on sends no photo, so no selection.
  if (draft.editLevel === 2 || draft.editLevel === 0) return false;
  return thumbnailWasEdited(draft.thumbnailCrop, draft.photo.width, draft.photo.height);
}

/** The edit as a brand new entry: same photo, details, date, position and thumbnail selection. */
export function asNewEntryDraft(draft: ComposeDraft): ComposeDraft {
  return {
    ...draft,
    mode: 'publish',
    // Facts about the old entry: it is gone, and so are its extras and its loaded photo.
    entryId: undefined,
    editLevel: undefined,
    originalDate: undefined,
    extrasRemove: undefined,
    existingImage: undefined,
    dirty: true,
  };
}

/** Deletes the entry, then posts the edits as a new entry; resolves with the new entry's id.
 * Order matters: the date is taken until the old entry is gone. If the delete fails nothing has
 * changed. If the post fails AFTER the delete, the entry is gone: the error carries the draft to
 * carry on with (`RepostFailedError.draft`), so the member's edits are never lost with it. */
export async function repostAsNewEntry(draft: ComposeDraft): Promise<string> {
  if (!draft.entryId) throw new Error('Only an edit can be posted as a new entry');
  const fresh = asNewEntryDraft(draft);
  await deleteEntry(draft.entryId);
  try {
    return await submitDraft(fresh);
  } catch (cause) {
    throw new RepostFailedError(fresh, cause);
  }
}

/** The new entry could not be posted after the old one was deleted. */
export class RepostFailedError extends Error {
  constructor(
    readonly draft: ComposeDraft,
    readonly cause: unknown,
  ) {
    super('The replacement entry could not be posted after the old one was deleted');
    this.name = 'RepostFailedError';
  }
}
