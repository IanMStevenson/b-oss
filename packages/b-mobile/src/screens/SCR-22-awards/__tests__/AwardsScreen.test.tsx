// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AwardsScreen } from '../AwardsScreen.js';

vi.mock('../../../data/users.js', () => ({
  fetchAwards: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <AwardsScreen username="alice" />
    </MemoryRouter>,
  );
}

describe('AwardsScreen', () => {
  it('loading: shows a spinner while the awards fetch is in flight', async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
  });

  it('shows an empty state and makes no assumption about award meaning text', async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('No awards yet.')).toBeDefined();
  });

  it('shows the full catalog with names, dimming awards that have not been earned', async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockResolvedValue([
      {
        award_id_str: '5',
        icon_url: 'https://example.com/5.png',
        added_stamp: 1786470178,
        secret: 0,
      },
      { award_id_str: '1', icon_url: 'https://example.com/1.png', added_stamp: null, secret: 0 },
    ]);
    renderScreen();
    const earnedLabel = await screen.findByText('Tag entry');
    const unearnedLabel = await screen.findByText('Basics');
    expect((earnedLabel.parentElement as HTMLElement).style.opacity).toBe('1');
    expect((unearnedLabel.parentElement as HTMLElement).style.opacity).toBe('0.35');
  });

  it('labels secret awards as "Secret" instead of their real name', async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockResolvedValue([
      { award_id_str: '20', icon_url: 'https://example.com/20.png', added_stamp: null, secret: 1 },
    ]);
    renderScreen();
    expect(await screen.findByText('Secret')).toBeDefined();
    expect(screen.queryByText('Hotel california')).toBeNull();
  });

  it("reveals a secret award's real name once the API reports it as no longer secret", async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockResolvedValue([
      {
        award_id_str: '20',
        icon_url: 'https://example.com/20.png',
        added_stamp: 1786470178,
        secret: 0,
      },
    ]);
    renderScreen();
    expect(await screen.findByText('Hotel california')).toBeDefined();
    expect(screen.queryByText('Secret')).toBeNull();
  });

  it('shows an error with retry on failure', async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockRejectedValue(new Error('Network down'));
    renderScreen();
    expect(await screen.findByText('Network down')).toBeDefined();
  });
});
