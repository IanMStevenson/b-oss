// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PhotoScreen } from '../PhotoScreen.js';
import type { BlipEntry } from '@b-oss/b-view';

vi.mock('../../../data/entries.js', () => ({
  fetchEntry: vi.fn(),
}));

const baseEntry: BlipEntry = {
  entry_id: '1',
  date: '2026-01-01',
  title: 'A day out',
  username: 'alice',
  journal_title: "Alice's journal",
  description: '',
  description_html: '',
  tags: [],
  location: null,
  views_total: 0,
  stars_total: 0,
  favorites_total: 0,
  comments: [],
  exif: null,
  images: { image: 'https://example.com/photo.jpg' },
};

const reactionFields = {
  actions: null,
  starred: false,
  favorited: false,
  friendship: null,
  comments: [],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <PhotoScreen entryId="1" />
    </MemoryRouter>,
  );
}

describe('PhotoScreen', () => {
  it('shows a spinner while loading', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
  });

  it('shows an error with retry on failure', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockRejectedValue(new Error('Network down'));
    renderScreen();
    expect(await screen.findByText('Network down')).toBeDefined();
  });

  it("renders the full-resolution photo once loaded, with no higher-res affordance, via b-view's Lightbox", async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: baseEntry,
      prevEntryId: null,
      nextEntryId: null,
      ...reactionFields,
    });
    const { container } = renderScreen();
    const img = await screen.findByRole('dialog').then(() => container.querySelector('img'));
    expect(img?.getAttribute('src')).toBe('https://example.com/photo.jpg');
    expect(screen.queryByText(/original/i)).toBeNull();
  });

  it('shows a closed state rather than a broken image when the entry has no photo', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: { ...baseEntry, images: {} },
      prevEntryId: null,
      nextEntryId: null,
      ...reactionFields,
    });
    renderScreen();
    expect(await screen.findByText(/couldn't be loaded/)).toBeDefined();
    expect(screen.getByText('Close')).toBeDefined();
  });

  it("falls back to a retry state if the image itself fails to load, via Lightbox's onImageError", async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: baseEntry,
      prevEntryId: null,
      nextEntryId: null,
      ...reactionFields,
    });
    const { container } = renderScreen();
    const img = await screen.findByRole('dialog').then(() => container.querySelector('img'));
    img!.dispatchEvent(new Event('error'));
    expect(await screen.findByText(/couldn't be loaded/)).toBeDefined();
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeDefined();

    retryButton.click();
    const retriedImg = await screen.findByRole('dialog').then(() => container.querySelector('img'));
    expect(retriedImg?.getAttribute('src')).toBe('https://example.com/photo.jpg');
  });
});
