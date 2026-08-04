// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AwardsScreen } from '../AwardsScreen.js';

vi.mock('../../../data/users.js', () => ({
  fetchAwards: vi.fn(),
}));

const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
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
  it('shows an empty state and makes no assumption about award meaning text', async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('No awards yet.')).toBeDefined();
  });

  it('renders earned awards as a badge grid, and a tap opens the icon guide', async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockResolvedValue([
      { award_id_str: 'a1', icon_url: 'https://example.com/a1.png', added_stamp: 1, secret: 0 },
    ]);
    renderScreen();
    const badge = await screen.findByAltText('Award');
    await userEvent.click(badge);
    expect(push).toHaveBeenCalledWith('/help/icon-guide');
  });

  it('shows an error with retry on failure', async () => {
    const { fetchAwards } = await import('../../../data/users.js');
    vi.mocked(fetchAwards).mockRejectedValue(new Error('Network down'));
    renderScreen();
    expect(await screen.findByText('Network down')).toBeDefined();
  });
});
