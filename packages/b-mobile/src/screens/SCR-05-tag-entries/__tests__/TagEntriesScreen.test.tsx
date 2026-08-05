// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TagEntriesScreen } from '../TagEntriesScreen.js';
import type { EntryIndex } from '@b-oss/b-view';

vi.mock('../../../data/entries.js', () => ({
  fetchTagPage: vi.fn(),
}));

const entry: EntryIndex = {
  entry_id: '1',
  date: '2026-01-01',
  title: 'Sunrise',
  thumbnail_path: 'https://example.com/thumb.jpg',
  json_path: '1',
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <TagEntriesScreen tag="sunrise" />
    </MemoryRouter>,
  );
}

describe('TagEntriesScreen', () => {
  it('shows the tag as the title', async () => {
    const { fetchTagPage } = await import('../../../data/entries.js');
    vi.mocked(fetchTagPage).mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText('#sunrise')).toBeDefined();
  });

  it('shows a spinner while loading', async () => {
    const { fetchTagPage } = await import('../../../data/entries.js');
    vi.mocked(fetchTagPage).mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
  });

  it('shows an error with retry on failure', async () => {
    const { fetchTagPage } = await import('../../../data/entries.js');
    vi.mocked(fetchTagPage).mockRejectedValue(new Error('Network down'));
    renderScreen();
    expect(await screen.findByText('Network down')).toBeDefined();
  });

  it('names the tag in the empty state', async () => {
    const { fetchTagPage } = await import('../../../data/entries.js');
    vi.mocked(fetchTagPage).mockResolvedValue({ items: [], more: false });
    renderScreen();
    expect(await screen.findByText(/No entries tagged.*sunrise/)).toBeDefined();
  });

  it('renders a grid of matching entries', async () => {
    const { fetchTagPage } = await import('../../../data/entries.js');
    vi.mocked(fetchTagPage).mockResolvedValue({ items: [entry], more: false });
    renderScreen();
    expect(await screen.findByLabelText('2026-01-01')).toBeDefined();
  });
});
