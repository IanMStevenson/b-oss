// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#175: "Download photo" is ONLY for the signed-in account's own journal. This pins the rule at
// the flow level, independent of whether any screen offers the button.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  downloadOwnEntryImage,
  downloadFileName,
  NotYourEntryError,
  NoImageError,
} from '../downloadFlow.js';

const saveRemoteImageToGallery = vi.fn<(url: string, name: string) => Promise<string | null>>();
vi.mock('../../platform/mediaSave.js', () => ({
  saveRemoteImageToGallery: (u: string, n: string) => saveRemoteImageToGallery(u, n),
}));

const entry = {
  entry_id: '123',
  date: '2026-10-05',
  username: 'cyclops',
  images: { image: 'https://cdn.example/photo.jpg' },
};

beforeEach(() => {
  vi.resetAllMocks();
  saveRemoteImageToGallery.mockResolvedValue('Pictures/b-mobile/x.jpg');
});

describe('downloadOwnEntryImage', () => {
  it('saves your own entry’s main image, named from user, date and entry id', async () => {
    const where = await downloadOwnEntryImage(entry, 'cyclops');
    expect(saveRemoteImageToGallery).toHaveBeenCalledWith(
      'https://cdn.example/photo.jpg',
      'blipfoto-cyclops-2026-10-05-123',
    );
    expect(where).toBe('Pictures/b-mobile/x.jpg');
    expect(downloadFileName(entry)).toBe('blipfoto-cyclops-2026-10-05-123');
  });

  it('REFUSES someone else’s entry, without fetching or saving anything', async () => {
    await expect(downloadOwnEntryImage(entry, 'cyclopstest')).rejects.toBeInstanceOf(
      NotYourEntryError,
    );
    expect(saveRemoteImageToGallery).not.toHaveBeenCalled();
  });

  it('REFUSES when nobody is signed in', async () => {
    await expect(downloadOwnEntryImage(entry, null)).rejects.toBeInstanceOf(NotYourEntryError);
    await expect(downloadOwnEntryImage(entry, undefined)).rejects.toBeInstanceOf(NotYourEntryError);
    expect(saveRemoteImageToGallery).not.toHaveBeenCalled();
  });

  it('compares usernames exactly (no case-folding or prefix matches)', async () => {
    await expect(downloadOwnEntryImage(entry, 'Cyclops')).rejects.toBeInstanceOf(NotYourEntryError);
    await expect(downloadOwnEntryImage(entry, 'cyclop')).rejects.toBeInstanceOf(NotYourEntryError);
  });

  it('says so when the entry has no photo', async () => {
    await expect(downloadOwnEntryImage({ ...entry, images: {} }, 'cyclops')).rejects.toBeInstanceOf(
      NoImageError,
    );
  });
});
