// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { BlipfotoError } from '@b-oss/b-api';
import { EditEntryScreen } from '../EditEntryScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';

const { fetchEntry, deleteEntry } = vi.hoisted(() => ({
  fetchEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));
vi.mock('../../../data/entries.js', () => ({ fetchEntry, deleteEntry }));

const { fetchUserProfile } = vi.hoisted(() => ({
  fetchUserProfile: vi.fn(),
}));
vi.mock('../../../data/users.js', () => ({ fetchUserProfile }));

const { enqueueDraft } = vi.hoisted(() => ({ enqueueDraft: vi.fn() }));
vi.mock('../../../flows/composeFlow.js', () => ({ enqueueDraft }));

const replace = vi.fn();
const goBack = vi.fn();
const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace, goBack }),
}));

beforeEach(() => {
  fetchUserProfile.mockResolvedValue({ details: { member: 1 } });
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

function renderScreen() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <EditEntryScreen entryId="e1" />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('EditEntryScreen', () => {
  it('loads the entry and pre-fills the details form', async () => {
    renderScreen();
    expect(await screen.findByDisplayValue('Sunrise')).toBeDefined();
    expect(screen.getByDisplayValue('dawn')).toBeDefined();
  });

  it('shows an error and no form when the entry fails to load', async () => {
    fetchEntry.mockRejectedValue(new BlipfotoError(404, 'Not found'));
    renderScreen();
    expect(await screen.findByText('Not found')).toBeDefined();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('Save enqueues the edit and returns to SCR-06', async () => {
    enqueueDraft.mockResolvedValue('q1');
    renderScreen();
    await screen.findByDisplayValue('Sunrise');

    await userEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/entry/e1'));
    expect(useComposeDraftStore.getState().draft).toBeNull();
  });

  it('Replace image opens the picker screen; a photo picked there shows in the frame', async () => {
    renderScreen();
    await screen.findByDisplayValue('Sunrise');

    await userEvent.click(screen.getByText('Replace image'));
    expect(push).toHaveBeenCalledWith('/entry/e1/edit/photo');
    // The inline camera/gallery buttons are gone — the picker screen owns those now.
    expect(screen.queryByText('Take a photo')).toBeNull();

    act(() => {
      useComposeDraftStore.getState().patchDraft({
        photo: {
          uri: 'file:///new.jpg',
          webPath: 'blob:new',
          mimeType: 'image/jpeg',
          width: 800,
          height: 600,
          createdAt: null,
          sizeBytes: null,
        },
      });
    });
    expect(await screen.findByAltText('Selected')).toBeDefined();
    // Details form is still there.
    expect(screen.getByDisplayValue('Sunrise')).toBeDefined();
  });

  it('editLevel 2 (older entry): only tags and location are offered, with an explanation', async () => {
    fetchEntry.mockResolvedValue({
      ...(await fetchEntry('e1')),
      actions: { star: 1, favorite: 1, comment: 1, edit: 2, delete: 1 },
    });
    renderScreen();
    await screen.findByDisplayValue('dawn');
    expect(screen.getByText(/only allows the tags and location/i)).toBeDefined();
    expect(screen.queryByDisplayValue('Sunrise')).toBeNull();
    expect(screen.queryByText('Replace image')).toBeNull();
    expect(useComposeDraftStore.getState().draft?.editLevel).toBe(2);
  });

  it('editLevel 0: nothing is editable and Save is disabled', async () => {
    fetchEntry.mockResolvedValue({
      ...(await fetchEntry('e1')),
      actions: { star: 1, favorite: 1, comment: 1, edit: 0, delete: 1 },
    });
    renderScreen();
    await screen.findByText(/doesn't allow this entry to be edited/i);
    expect(screen.getByText('Save').closest('ion-button')!.hasAttribute('disabled')).toBe(true);
  });

  it('Delete entry confirms, then deletes and returns to Browse', async () => {
    deleteEntry.mockResolvedValue(undefined);
    renderScreen();
    await screen.findByDisplayValue('Sunrise');

    await userEvent.click(screen.getByText('Delete entry'));
    expect(await screen.findByText('Delete this entry?')).toBeDefined();
    const confirmButton = document.querySelector(
      'ion-alert[header="Delete this entry?"] button.alert-button-role-destructive',
    ) as HTMLElement;
    await userEvent.click(confirmButton);

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith('e1'));
    expect(replace).toHaveBeenCalledWith('/browse');
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
    renderScreen();
    expect(await screen.findByDisplayValue('Already editing')).toBeDefined();
    expect(fetchEntry).not.toHaveBeenCalled();
  });
});
