// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComposeDraft } from '../../state/composeDraftStore.js';

const { deleteEntry } = vi.hoisted(() => ({ deleteEntry: vi.fn() }));
vi.mock('../../data/entries.js', () => ({ deleteEntry }));
const { submitDraft } = vi.hoisted(() => ({ submitDraft: vi.fn() }));
vi.mock('../composeFlow.js', () => ({ submitDraft }));

import { initialThumbnailCrop } from '../../data/imageCrop.js';
import {
  RepostFailedError,
  asNewEntryDraft,
  needsThumbnailDecision,
  repostAsNewEntry,
} from '../thumbnailDecision.js';

const photo = {
  webPath: 'blob:new',
  mimeType: 'image/jpeg',
  width: 1600,
  height: 1000,
  createdAt: null,
  sizeBytes: 1000,
};
const base: ComposeDraft = {
  mode: 'edit',
  accountId: 'a1',
  entryId: 'e1',
  editLevel: 1,
  photo,
  title: 'T',
  tags: 'a',
  description: 'D',
  date: '2026-01-01',
  originalDate: '2026-01-01',
  location: { lat: 1, lon: 2 },
  displayLocation: true,
  thumbnailCrop: { x: 0.3, y: 0.2, w: 0.4 },
  extras: [{ ...photo, webPath: 'blob:extra' }],
  extrasRemove: ['old'],
  existingImage: 'https://x/old.jpg',
  dirty: true,
};

beforeEach(() => {
  deleteEntry.mockReset();
  submitDraft.mockReset();
});

describe('needsThumbnailDecision', () => {
  it('is true for a replacement photo whose thumbnail selection the member changed', () => {
    expect(needsThumbnailDecision(base)).toBe(true);
  });

  it('is false when the selection is still the default the picker starts from', () => {
    const initial = initialThumbnailCrop(photo.width, photo.height);
    expect(needsThumbnailDecision({ ...base, thumbnailCrop: initial })).toBe(false);
    // The selector reports its area as it loads, to four places: "the same" is within a hair.
    expect(
      needsThumbnailDecision({
        ...base,
        thumbnailCrop: initial && { ...initial, x: initial.x + 0.001 },
      }),
    ).toBe(false);
  });

  it('is false when the photo is not replaced, there is no selection, or it is not an edit', () => {
    expect(needsThumbnailDecision({ ...base, photo: null })).toBe(false);
    expect(needsThumbnailDecision({ ...base, thumbnailCrop: null })).toBe(false);
    expect(needsThumbnailDecision({ ...base, mode: 'publish' })).toBe(false);
  });

  it('is false for an entry the API lets only tags and location be changed on', () => {
    expect(needsThumbnailDecision({ ...base, editLevel: 2 })).toBe(false);
    expect(needsThumbnailDecision({ ...base, editLevel: 0 })).toBe(false);
  });
});

describe('asNewEntryDraft', () => {
  it('keeps the photo, details, date, position, selection and new extras; drops the old entry', () => {
    const next = asNewEntryDraft(base);
    expect(next).toMatchObject({
      mode: 'publish',
      accountId: 'a1',
      photo,
      title: 'T',
      tags: 'a',
      description: 'D',
      date: '2026-01-01',
      location: { lat: 1, lon: 2 },
      displayLocation: true,
      thumbnailCrop: { x: 0.3, y: 0.2, w: 0.4 },
      extras: base.extras,
      dirty: true,
    });
    expect(next.entryId).toBeUndefined();
    expect(next.editLevel).toBeUndefined();
    expect(next.originalDate).toBeUndefined();
    expect(next.extrasRemove).toBeUndefined();
    expect(next.existingImage).toBeUndefined();
  });
});

describe('repostAsNewEntry', () => {
  it('deletes the entry first (its date is taken until then), then posts the new one', async () => {
    const order: string[] = [];
    deleteEntry.mockImplementation(() => {
      order.push('delete');
      return Promise.resolve();
    });
    submitDraft.mockImplementation(() => {
      order.push('publish');
      return Promise.resolve('new1');
    });
    expect(await repostAsNewEntry(base)).toBe('new1');
    expect(order).toEqual(['delete', 'publish']);
    expect(deleteEntry).toHaveBeenCalledWith('e1');
    expect(submitDraft.mock.calls[0]?.[0]).toMatchObject({ mode: 'publish', date: '2026-01-01' });
  });

  it('posts nothing if the delete fails, so nothing has changed', async () => {
    deleteEntry.mockRejectedValue(new Error('offline'));
    await expect(repostAsNewEntry(base)).rejects.toThrow('offline');
    expect(submitDraft).not.toHaveBeenCalled();
  });

  it('keeps every edit, as a new-entry draft, if the post fails after the delete', async () => {
    deleteEntry.mockResolvedValue(undefined);
    submitDraft.mockRejectedValue(new Error('upload failed'));
    const error = await repostAsNewEntry(base).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RepostFailedError);
    const failed = error as RepostFailedError;
    expect((failed.cause as Error).message).toBe('upload failed');
    expect(failed.draft).toMatchObject({ mode: 'publish', title: 'T', photo, date: '2026-01-01' });
  });

  it('refuses a draft that is not an edit', async () => {
    await expect(repostAsNewEntry({ ...base, entryId: undefined })).rejects.toThrow();
    expect(deleteEntry).not.toHaveBeenCalled();
  });
});
