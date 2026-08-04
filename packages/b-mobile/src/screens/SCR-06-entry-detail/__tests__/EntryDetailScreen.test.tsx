// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryDetailScreen } from '../EntryDetailScreen.js';
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
  description: 'Went to the [b]beach[/b].',
  description_html: '',
  tags: ['beach', 'sun'],
  location: null,
  views_total: 12,
  stars_total: 3,
  favorites_total: 1,
  comments: [],
  exif: null,
  images: { image: 'https://example.com/photo.jpg' },
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <EntryDetailScreen entryId="1" />
    </MemoryRouter>,
  );
}

describe('EntryDetailScreen', () => {
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
    expect(screen.getByText('Retry')).toBeDefined();
  });

  it('renders the entry once loaded', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: baseEntry,
      prevEntryId: null,
      nextEntryId: null,
    });
    renderScreen();
    expect(await screen.findByText('A day out')).toBeDefined();
    await waitFor(() => expect(screen.getByText('#beach')).toBeDefined());
    expect(screen.getByText('#sun')).toBeDefined();
    expect(screen.getByText(/12 views/)).toBeDefined();
  });
});
