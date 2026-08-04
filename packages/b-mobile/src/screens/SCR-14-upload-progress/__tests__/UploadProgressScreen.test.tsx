// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UploadProgressScreen } from '../UploadProgressScreen.js';
import { useUploadQueueStore } from '../../../state/uploadQueueStore.js';
import type { UploadQueueItem } from '../../../state/uploadQueueStore.js';

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
}));

function item(overrides: Partial<UploadQueueItem>): UploadQueueItem {
  return {
    id: 'q1',
    accountId: 'a1',
    kind: 'publish',
    filePath: null,
    fileMimeType: null,
    fields: {},
    status: 'waiting',
    attempts: 0,
    nextAttemptAt: null,
    error: null,
    displayTitle: 'Sunrise',
    createdAt: Date.now(),
    resultEntryId: null,
    ...overrides,
  };
}

beforeEach(() => {
  useUploadQueueStore.setState({ items: [], hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <UploadProgressScreen />
    </MemoryRouter>,
  );
}

describe('UploadProgressScreen', () => {
  it('shows an empty message with nothing queued', () => {
    renderScreen();
    expect(screen.getByText('Nothing queued or recently uploaded.')).toBeDefined();
  });

  it('lists every status live from the store', () => {
    useUploadQueueStore.setState({
      hydrated: true,
      items: [
        item({ id: 'w', status: 'waiting', displayTitle: 'Cat' }),
        item({ id: 'u', status: 'uploading', displayTitle: 'Harbour' }),
        item({ id: 'd', status: 'uploaded', displayTitle: 'Sunrise', resultEntryId: 'e1' }),
        item({ id: 'f', status: 'failed', displayTitle: 'Blurry', error: 'Too dark' }),
      ],
    });
    renderScreen();
    expect(screen.getByText(/Waiting/)).toBeDefined();
    expect(screen.getByText(/Uploading/)).toBeDefined();
    expect(screen.getByText(/Uploaded/)).toBeDefined();
    expect(screen.getByText(/Failed — Too dark/)).toBeDefined();
  });

  it('tapping a completed upload opens its entry', async () => {
    useUploadQueueStore.setState({
      hydrated: true,
      items: [item({ id: 'd', status: 'uploaded', displayTitle: 'Sunrise', resultEntryId: 'e1' })],
    });
    renderScreen();
    await userEvent.click(screen.getByText('Sunrise'));
    expect(push).toHaveBeenCalledWith('/entry/e1');
  });

  it('a failed or in-progress item is not tappable', async () => {
    useUploadQueueStore.setState({
      hydrated: true,
      items: [item({ id: 'f', status: 'failed', displayTitle: 'Blurry', error: 'Too dark' })],
    });
    renderScreen();
    await userEvent.click(screen.getByText('Blurry'));
    expect(push).not.toHaveBeenCalled();
  });

  it('remains correct (still reflects the store) as if returning to the screen after leaving', () => {
    useUploadQueueStore.setState({
      hydrated: true,
      items: [item({ id: 'w', status: 'waiting', displayTitle: 'Cat' })],
    });
    const { unmount } = renderScreen();
    unmount();
    useUploadQueueStore.getState().updateItem('w', { status: 'uploaded', resultEntryId: 'e9' });
    renderScreen();
    expect(screen.getByText(/Uploaded/)).toBeDefined();
  });
});
