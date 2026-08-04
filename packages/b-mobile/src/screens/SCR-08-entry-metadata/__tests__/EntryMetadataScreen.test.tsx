// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryMetadataScreen } from '../EntryMetadataScreen.js';
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
  images: {},
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
      <EntryMetadataScreen entryId="1" />
    </MemoryRouter>,
  );
}

describe('EntryMetadataScreen', () => {
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

  it('shows only the fields that have a value, omitting blanks', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: {
        ...baseEntry,
        exif: {
          make: 'Leica',
          model: 'Q2',
          camera: null,
          exposure_time: '1/250 s',
          f_number: null,
          focal_length: '28 mm',
          iso: null,
        },
      },
      prevEntryId: null,
      nextEntryId: null,
      ...reactionFields,
    });
    renderScreen();
    expect(await screen.findByText('Leica Q2')).toBeDefined();
    expect(screen.getByText('1/250 s')).toBeDefined();
    expect(screen.getByText('28 mm')).toBeDefined();
    expect(screen.queryByText('Aperture')).toBeNull();
    expect(screen.queryByText('ISO')).toBeNull();
  });

  it('shows "No camera information" when the entry has no exif data', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: baseEntry,
      prevEntryId: null,
      nextEntryId: null,
      ...reactionFields,
    });
    renderScreen();
    expect(await screen.findByText('No camera information.')).toBeDefined();
  });
});
