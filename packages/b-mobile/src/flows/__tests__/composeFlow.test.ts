// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUploadQueueStore } from '../../state/uploadQueueStore.js';
import type { ComposeDraft } from '../../state/composeDraftStore.js';

const { copyPhotoToAppStorage } = vi.hoisted(() => ({
  copyPhotoToAppStorage: vi.fn().mockResolvedValue('/files/p.jpg'),
}));
vi.mock('../../platform/upload.js', () => ({ copyPhotoToAppStorage }));
vi.mock('../uploadQueueRunner.js', () => ({ wakeUploadQueueRunner: vi.fn() }));

import { enqueueDraft } from '../composeFlow.js';

const draft: ComposeDraft = {
  mode: 'edit',
  accountId: 'a1',
  entryId: 'e1',
  photo: {
    webPath: 'blob:x',
    mimeType: 'image/jpeg',
    width: 1,
    height: 1,
    createdAt: null,
    sizeBytes: null,
  },
  title: 'New title',
  tags: 'a, b',
  description: 'New description',
  date: '2026-01-01',
  location: { lat: 1, lon: 2 },
  displayLocation: true,
  thumbnailCrop: null,
  dirty: true,
};

beforeEach(() => {
  useUploadQueueStore.setState({ items: [], hydrated: true });
  copyPhotoToAppStorage.mockClear();
});

describe('enqueueDraft — partly editable entries', () => {
  it('editLevel 2 queues tags and location only, with no title, description or photo', async () => {
    await enqueueDraft({ ...draft, editLevel: 2 });
    const [item] = useUploadQueueStore.getState().items;
    expect(item.fields).toEqual({
      title: undefined,
      description: undefined,
      tags: 'a, b',
      lat: 1,
      lon: 2,
      display_location: 1,
    });
    expect(item.filePath).toBeNull();
    expect(copyPhotoToAppStorage).not.toHaveBeenCalled();
  });

  it('a fully editable entry still queues everything', async () => {
    await enqueueDraft({ ...draft, editLevel: 1 });
    const [item] = useUploadQueueStore.getState().items;
    expect(item.fields).toMatchObject({ title: 'New title', description: 'New description' });
    expect(item.filePath).toBe('/files/p.jpg');
  });

  it('queues the selected thumbnail with a replacement photo, and drops it without one', async () => {
    const thumbnailCrop = { x: 0.1, y: 0.2, w: 0.3 };
    await enqueueDraft({ ...draft, editLevel: 1, thumbnailCrop });
    await enqueueDraft({ ...draft, editLevel: 1, photo: null, thumbnailCrop });
    const [withPhoto, withoutPhoto] = useUploadQueueStore.getState().items;
    expect(withPhoto.fields).toMatchObject({ thumbnail_crop: '0.1,0.2,0.3' });
    expect(withoutPhoto.fields).not.toHaveProperty('thumbnail_crop', '0.1,0.2,0.3');
  });
});
