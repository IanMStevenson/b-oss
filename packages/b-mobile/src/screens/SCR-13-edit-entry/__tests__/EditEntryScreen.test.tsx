// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BlipfotoError } from '@b-oss/b-api';
import { EditEntryScreen } from '../EditEntryScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';

const { fetchEntry } = vi.hoisted(() => ({ fetchEntry: vi.fn() }));
vi.mock('../../../data/entries.js', () => ({ fetchEntry }));

const { enqueueDraft } = vi.hoisted(() => ({ enqueueDraft: vi.fn() }));
vi.mock('../../../flows/composeFlow.js', () => ({ enqueueDraft }));

const { takePhoto, pickPhoto } = vi.hoisted(() => ({ takePhoto: vi.fn(), pickPhoto: vi.fn() }));
vi.mock('../../../platform/camera.js', () => ({ takePhoto, pickPhoto }));

const replace = vi.fn();
const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace, goBack }),
}));

beforeEach(() => {
  useAccountsStore.setState({
    accounts: [
      {
        id: 'a1',
        username: 'me',
        avatarUrl: null,
        appTokenScope: 'read,write',
        hasServiceToken: false,
        notificationRegistrationId: null,
        notificationStatus: null,
      },
    ],
    activeAccountId: 'a1',
    hydrated: true,
  });
  useComposeDraftStore.setState({ draft: null });
  fetchEntry.mockResolvedValue({
    entry: {
      entry_id: 'e1',
      date: '2026-01-01',
      title: 'Sunrise',
      username: 'me',
      journal_title: '',
      description: 'Original description',
      description_html: '',
      tags: ['dawn'],
      location: null,
      views_total: 0,
      stars_total: 0,
      favorites_total: 0,
      comments: [],
      exif: null,
      images: {},
    },
    prevEntryId: null,
    nextEntryId: null,
    actions: null,
    starred: false,
    favorited: false,
    friendship: null,
    comments: [],
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(mode: 'details' | 'photo' = 'details') {
  return render(
    <MemoryRouter>
      <EditEntryScreen entryId="e1" initialMode={mode} />
    </MemoryRouter>,
  );
}

describe('EditEntryScreen', () => {
  it('loads the entry and pre-fills the details form', async () => {
    renderScreen('details');
    expect(await screen.findByDisplayValue('Sunrise')).toBeDefined();
    expect(screen.getByDisplayValue('dawn')).toBeDefined();
  });

  it('shows an error and no form when the entry fails to load', async () => {
    fetchEntry.mockRejectedValue(new BlipfotoError(404, 'Not found'));
    renderScreen('details');
    expect(await screen.findByText('Not found')).toBeDefined();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('Save enqueues the edit and returns to SCR-06', async () => {
    enqueueDraft.mockResolvedValue('q1');
    renderScreen('details');
    await screen.findByDisplayValue('Sunrise');

    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/entry/e1'));
    expect(useComposeDraftStore.getState().draft).toBeNull();
  });

  it('replace-photo mode offers capture/pick and previews the chosen photo', async () => {
    takePhoto.mockResolvedValue({
      uri: 'file:///new.jpg',
      webPath: 'blob:new',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      createdAt: null,
    });
    renderScreen('photo');
    await waitFor(() => expect(useComposeDraftStore.getState().draft).not.toBeNull());

    await userEvent.click(screen.getByText('Take a photo'));
    await waitFor(() =>
      expect(useComposeDraftStore.getState().draft?.photo?.webPath).toBe('blob:new'),
    );
    expect(await screen.findByAltText('New photo')).toBeDefined();
  });

  it('reuses the current draft instead of refetching if one is already open for this entry', async () => {
    useComposeDraftStore.setState({
      draft: {
        mode: 'edit',
        accountId: 'a1',
        entryId: 'e1',
        photo: null,
        title: 'Already editing',
        tags: '',
        description: '',
        date: '2026-01-01',
        location: null,
        displayLocation: false,
        thumbnailCrop: null,
        dirty: true,
      },
    });
    renderScreen('details');
    expect(await screen.findByDisplayValue('Already editing')).toBeDefined();
    expect(fetchEntry).not.toHaveBeenCalled();
  });
});
