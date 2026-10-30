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
import { StillVisibleError } from '../../../data/entryLocation.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';

const { fetchEntry, deleteEntry } = vi.hoisted(() => ({
  fetchEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));
vi.mock('../../../data/entries.js', () => ({ fetchEntry, deleteEntry }));

const { revealStoredPosition } = vi.hoisted(() => ({ revealStoredPosition: vi.fn() }));
vi.mock('../../../data/entryLocation.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../data/entryLocation.js')>()),
  revealStoredPosition,
}));

const { enqueueDraft } = vi.hoisted(() => ({ enqueueDraft: vi.fn() }));
vi.mock('../../../flows/composeFlow.js', () => ({ enqueueDraft }));

const replace = vi.fn();
const goBack = vi.fn();
const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace, goBack }),
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
    expect(await screen.findByAltText('New photo')).toBeDefined();
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

  describe('Add to map for an entry whose position the app does not hold', () => {
    function toggleMapOn(): void {
      screen
        .getByLabelText('Add to map')
        .dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }));
    }

    it('looks up the position Blipfoto holds, keeps it in the draft and opens the picker', async () => {
      revealStoredPosition.mockResolvedValue({ lat: 55.9, lon: -3.2 });
      renderScreen();
      await screen.findByDisplayValue('Sunrise');

      toggleMapOn();

      await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/location'));
      expect(revealStoredPosition).toHaveBeenCalledWith('a1', 'e1');
      const draft = useComposeDraftStore.getState().draft;
      expect(draft?.location).toEqual({ lat: 55.9, lon: -3.2 });
      // The map stays off until the user confirms in the picker.
      expect(draft?.displayLocation).toBe(false);
    });

    it('opens an empty picker when Blipfoto holds no position', async () => {
      revealStoredPosition.mockResolvedValue(null);
      renderScreen();
      await screen.findByDisplayValue('Sunrise');

      toggleMapOn();

      await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/location'));
      expect(useComposeDraftStore.getState().draft?.location).toBeNull();
    });

    it('says so and does not open the picker when the lookup fails', async () => {
      revealStoredPosition.mockRejectedValue(new BlipfotoError(500, 'Server error'));
      renderScreen();
      await screen.findByDisplayValue('Sunrise');

      toggleMapOn();

      expect(await screen.findByText(/Server error|position/)).toBeDefined();
      expect(push).not.toHaveBeenCalledWith('/compose/location');
      expect(useComposeDraftStore.getState().draft?.displayLocation).toBe(false);
    });

    it('warns that the entry is still on the map when it could not be hidden again, but keeps the position', async () => {
      revealStoredPosition.mockRejectedValue(new StillVisibleError({ lat: 1, lon: 2 }));
      renderScreen();
      await screen.findByDisplayValue('Sunrise');

      toggleMapOn();

      expect(await screen.findByText(/showing on the map/)).toBeDefined();
      expect(useComposeDraftStore.getState().draft?.location).toEqual({ lat: 1, lon: 2 });
      expect(push).not.toHaveBeenCalledWith('/compose/location');
    });

    it('does not look anything up when the position is already known', async () => {
      fetchEntry.mockResolvedValue({
        ...(await fetchEntry.getMockImplementation()?.()),
      });
      renderScreen();
      await screen.findByDisplayValue('Sunrise');
      act(() => {
        useComposeDraftStore.getState().patchDraft({ location: { lat: 5, lon: 6 } });
      });

      toggleMapOn();

      await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/location'));
      expect(revealStoredPosition).not.toHaveBeenCalled();
    });
  });
});
