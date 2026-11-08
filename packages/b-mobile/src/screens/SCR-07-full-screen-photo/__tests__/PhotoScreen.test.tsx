// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
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
    renderScreen();
    const img = await screen.findByRole('dialog').then(() => document.querySelector('img'));
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
    renderScreen();
    await screen.findByRole('dialog');
    // The dialog can be up a beat before its <img> is, so wait for the image itself.
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    document.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(await screen.findByText(/couldn't be loaded/)).toBeDefined();
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeDefined();

    retryButton.click();
    // The dialog is already on screen, so wait for the retried image itself, not the dialog.
    await waitFor(() =>
      expect(document.querySelector('img')?.getAttribute('src')).toBe(
        'https://example.com/photo.jpg',
      ),
    );
  });

  it('shows title, journal name and date, and no arrows for a single image even with neighbouring entries (b-oss#955)', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: baseEntry,
      prevEntryId: '0',
      nextEntryId: '2',
      ...reactionFields,
    });
    renderScreen();
    await screen.findByRole('dialog');
    expect(screen.getByText('A day out')).toBeDefined();
    expect(screen.getByText(/Alice's journal/)).toBeDefined();
    expect(screen.getByText(/1st Jan 2026/)).toBeDefined();
    expect(screen.queryByLabelText('Previous image')).toBeNull();
    expect(screen.queryByLabelText('Next image')).toBeNull();
  });

  it("opens on the photo in router state and steps only through this entry's photos (b-oss#955)", async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: {
        ...baseEntry,
        images: {
          image: 'https://example.com/photo.jpg',
          extras: [
            { item_id: 'e1', image: 'https://example.com/x1.jpg' },
            { item_id: 'e2', image: 'https://example.com/x2.jpg' },
          ],
        },
      },
      prevEntryId: '0',
      nextEntryId: '2',
      ...reactionFields,
    });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/entry/1/photo', state: { photoIndex: 1 } }]}>
        <PhotoScreen entryId="1" />
      </MemoryRouter>,
    );
    await screen.findByRole('dialog');
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://example.com/x1.jpg');
    expect(screen.getByLabelText<HTMLButtonElement>('Previous image').disabled).toBe(false);
    await userEvent.click(screen.getByLabelText('Next image'));
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://example.com/x2.jpg');
    expect(screen.getByLabelText<HTMLButtonElement>('Next image').disabled).toBe(true);
  });

  describe('Close returns to the entry without stacking a second copy', () => {
    function Probe() {
      const location = useLocation();
      const navigate = useNavigate();
      return (
        <div>
          <span data-testid="at">{location.pathname}</span>
          <button onClick={() => navigate(-1)}>history-back</button>
        </div>
      );
    }

    async function renderFrom(state: unknown, entries: string[]) {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue({
        entry: baseEntry,
        prevEntryId: null,
        nextEntryId: null,
        ...reactionFields,
      });
      render(
        <MemoryRouter
          initialEntries={[...entries, { pathname: '/entry/1/photo', state }]}
          initialIndex={entries.length}
        >
          <Probe />
          <Routes>
            <Route path="/entry/:id/photo" element={<PhotoScreen entryId="1" />} />
            <Route path="*" element={null} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByRole('dialog');
    }

    it('pops back to the entry that opened it, so Back from there leaves the entry', async () => {
      await renderFrom({ photoFrom: '1' }, ['/browse', '/entry/1']);
      await userEvent.click(screen.getByLabelText('Close'));
      expect(screen.getByTestId('at').textContent).toBe('/entry/1');
      await userEvent.click(screen.getByText('history-back'));
      expect(screen.getByTestId('at').textContent).toBe('/browse');
    });

    it('with no record of where it was opened from (deep link), replaces with the entry', async () => {
      await renderFrom(null, []);
      await userEvent.click(screen.getByLabelText('Close'));
      expect(screen.getByTestId('at').textContent).toBe('/entry/1');
    });
  });
});
