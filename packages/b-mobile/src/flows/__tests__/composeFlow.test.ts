// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComposeDraft } from '../../state/composeDraftStore.js';

const { publishEntry, updateEntry, photoToFileSource, onEntryPublished } = vi.hoisted(() => ({
  publishEntry: vi.fn().mockResolvedValue({ entry: { entry_id_str: 'new1' } }),
  updateEntry: vi.fn().mockResolvedValue({ entry: { entry_id_str: 'e1' } }),
  photoToFileSource: vi.fn().mockResolvedValue({ blob: 'B' }),
  onEntryPublished: vi.fn(),
}));
vi.mock('../../platform/upload.js', () => ({ photoToFileSource }));
vi.mock('../../data/client.js', () => ({
  getClientForAccount: vi.fn().mockResolvedValue({ publishEntry, updateEntry }),
}));
vi.mock('../accountsFlow.js', () => ({ handleForcedLogout: vi.fn() }));
vi.mock('../reminderFlow.js', () => ({ onEntryPublished }));

import { submitDraft } from '../composeFlow.js';

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
  vi.clearAllMocks();
});

describe('submitDraft', () => {
  it('editLevel 2 sends tags and location only, with no title, description or photo', async () => {
    await submitDraft({ ...draft, editLevel: 2 });
    expect(updateEntry).toHaveBeenCalledWith({
      entryId: 'e1',
      title: undefined,
      description: undefined,
      tags: 'a, b',
      lat: 1,
      lon: 2,
      display_location: 1,
      thumbnail_crop: undefined,
      image: undefined,
    });
    expect(photoToFileSource).not.toHaveBeenCalled();
  });

  it('a fully editable entry still sends everything', async () => {
    await submitDraft({ ...draft, editLevel: 1 });
    expect(updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New title', description: 'New description' }),
    );
    expect(photoToFileSource).toHaveBeenCalled();
  });

  it('sends the selected thumbnail with a replacement photo, and drops it without one', async () => {
    const thumbnailCrop = { x: 0.1, y: 0.2, w: 0.3 };
    await submitDraft({ ...draft, editLevel: 1, thumbnailCrop });
    await submitDraft({ ...draft, editLevel: 1, photo: null, thumbnailCrop });
    expect(updateEntry.mock.calls[0][0]).toMatchObject({ thumbnail_crop: '0.1,0.2,0.3' });
    expect(updateEntry.mock.calls[1][0]).not.toHaveProperty('thumbnail_crop', '0.1,0.2,0.3');
  });

  it('publishes a new entry, returns its id and notes it for the reminder', async () => {
    const id = await submitDraft({ ...draft, mode: 'publish', entryId: undefined });
    expect(id).toBe('new1');
    expect(publishEntry).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-01-01', image: { blob: 'B' } }),
    );
    expect(onEntryPublished).toHaveBeenCalledWith('a1');
  });

  it('lets a failure through without touching the reminder', async () => {
    publishEntry.mockRejectedValueOnce(new Error('boom'));
    await expect(submitDraft({ ...draft, mode: 'publish' })).rejects.toThrow('boom');
    expect(onEntryPublished).not.toHaveBeenCalled();
  });
});
