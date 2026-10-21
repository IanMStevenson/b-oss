// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#412: Save on SCR-13 queues the edit and returns straight to this screen, which fetches the
// entry while the queued update is still in flight. These tests drive the real enqueue → runner
// path (only the API client is faked) so the entry screen sees the queue exactly as it does on a
// device.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BlipfotoError } from '@b-oss/b-api';
import { EntryDetailScreen } from '../EntryDetailScreen.js';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { useUploadQueueStore } from '../../../state/uploadQueueStore.js';
import { enqueueDraft } from '../../../flows/composeFlow.js';
import { fetchEntry } from '../../../data/entries.js';
import type { LoadedEntry } from '../../../data/entries.js';
import type { ComposeDraft } from '../../../state/composeDraftStore.js';

const { fetchAuthorAvatar } = vi.hoisted(() => ({ fetchAuthorAvatar: vi.fn() }));
vi.mock('../../../data/users.js', () => ({ fetchAuthorAvatar }));

vi.mock('../../../data/entries.js', () => ({
  fetchEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

const client = vi.hoisted(() => ({ updateEntry: vi.fn() }));
vi.mock('../../../data/client.js', () => ({
  getClientForAccount: () => Promise.resolve(client),
}));

vi.mock('../../../platform/upload.js', () => ({
  copyPhotoToAppStorage: vi.fn(),
  readQueuedFileAsSource: vi.fn(),
  deleteQueuedFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../flows/reminderFlow.js', () => ({ onEntryPublished: vi.fn() }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../flows/accountsFlow.js', () => ({
  signInDeliberate: vi.fn(),
  handleForcedLogout: vi.fn(),
}));

const navPush = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: navPush, replace: vi.fn(), goBack: vi.fn() }),
}));

vi.setConfig({ testTimeout: 45_000 });

const entryBeforeEdit: LoadedEntry = {
  entry: {
    entry_id: '1',
    date: '2026-01-01',
    title: 'A day out',
    username: 'me',
    journal_title: 'My journal',
    description: 'Old words.',
    description_html: '',
    tags: ['beach'],
    location: null,
    views_total: 0,
    stars_total: 0,
    favorites_total: 0,
    comments: [],
    exif: null,
    images: { image: 'https://example.com/photo.jpg' },
  },
  prevEntryId: null,
  nextEntryId: null,
  actions: { star: 0, favorite: 0, comment: 1, edit: 1, delete: 1 },
  starred: false,
  favorited: false,
  friendship: null,
  comments: [],
};

const entryAfterEdit: LoadedEntry = {
  ...entryBeforeEdit,
  entry: {
    ...entryBeforeEdit.entry,
    title: 'Sunset walk',
    description: 'New words.',
    tags: ['sea', 'sky'],
  },
};

const editDraft: ComposeDraft = {
  mode: 'edit',
  accountId: 'a1',
  entryId: '1',
  photo: null,
  title: 'Sunset walk',
  tags: 'sea, sky',
  description: 'New words.',
  date: '2026-01-01',
  location: null,
  displayLocation: false,
  thumbnailCrop: null,
  dirty: true,
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

// The runner is a module singleton that drains one item at a time, so an update left unsettled
// by a failing test would hold up every later one; afterEach settles whatever is still open.
const openUpdates: Deferred<unknown>[] = [];

function deferredUpdate(): Deferred<{ entry: { entry_id_str: string } }> {
  let resolve!: (v: { entry: { entry_id_str: string } }) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<{ entry: { entry_id_str: string } }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const d = { promise, resolve, reject };
  openUpdates.push(d as Deferred<unknown>);
  return d;
}

/** What SCR-13's Save does: queue the edit, then show the entry. */
async function saveEditAndReturn(): Promise<void> {
  await enqueueDraft(editDraft);
  renderEntry();
}

function renderEntry(): void {
  render(
    <MemoryRouter>
      <OverlayProvider>
        <EntryDetailScreen entryId="1" />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

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
  useHiddenMembersStore.setState({ hidden: [], hydrated: true });
  useDevicePrefsStore.setState({ confirmAccountBeforeReaction: false, hydrated: true });
  useUploadQueueStore.setState({ items: [], hydrated: true });
  fetchAuthorAvatar.mockResolvedValue(null);
  // The entry screen's fetch answers before the queued update has gone through, so it returns
  // the entry as it was; any fetch after that returns the edited entry.
  vi.mocked(fetchEntry).mockResolvedValueOnce(entryBeforeEdit).mockResolvedValue(entryAfterEdit);
});

afterEach(async () => {
  cleanup();
  for (const d of openUpdates.splice(0)) d.resolve({ entry: { entry_id_str: '1' } });
  await waitFor(() =>
    expect(useUploadQueueStore.getState().items.every((i) => i.status !== 'uploading')).toBe(true),
  );
  vi.resetAllMocks();
});

describe('EntryDetailScreen after saving an edit (b-oss#412)', () => {
  it('shows the edited values while the edit is queued, then refreshes once it has gone through', async () => {
    const update = deferredUpdate();
    client.updateEntry.mockReturnValue(update.promise);

    await saveEditAndReturn();

    expect(await screen.findByText('Sunset walk')).toBeTruthy();
    expect(screen.getByText('New words.')).toBeTruthy();
    expect(screen.getByText('sea')).toBeTruthy();
    expect(screen.queryByText('A day out')).toBeNull();
    expect(screen.getByText('Saving your changes…')).toBeTruthy();
    expect(fetchEntry).toHaveBeenCalledTimes(1);

    update.resolve({ entry: { entry_id_str: '1' } });

    await waitFor(() => expect(fetchEntry).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Saving your changes…')).toBeNull());
    expect(screen.getByText('Sunset walk')).toBeTruthy();
    expect(screen.queryByText('A day out')).toBeNull();
  });

  it('reverts to the saved entry and says so when the edit fails', async () => {
    const update = deferredUpdate();
    client.updateEntry.mockReturnValue(update.promise);

    await saveEditAndReturn();
    expect(await screen.findByText('Sunset walk')).toBeTruthy();

    update.reject(new BlipfotoError(500, 'Server error'));

    expect(await screen.findByText(/Your changes to this entry weren't saved/)).toBeTruthy();
    expect(screen.getByText('A day out')).toBeTruthy();
    expect(screen.queryByText('Sunset walk')).toBeNull();
    expect(screen.queryByText('Saving your changes…')).toBeNull();

    await userEvent.click(screen.getByText('View uploads'));
    expect(navPush).toHaveBeenCalledWith('/uploads');
  });

  it('shows nothing extra for an edit that went through earlier', async () => {
    client.updateEntry.mockResolvedValue({ entry: { entry_id_str: '1' } });
    await enqueueDraft(editDraft);
    await waitFor(() => expect(useUploadQueueStore.getState().items[0]?.status).toBe('uploaded'));
    vi.mocked(fetchEntry).mockReset().mockResolvedValue(entryAfterEdit);

    renderEntry();

    expect(await screen.findByText('Sunset walk')).toBeTruthy();
    expect(screen.queryByText('Saving your changes…')).toBeNull();
    expect(fetchEntry).toHaveBeenCalledTimes(1);
  });
});
