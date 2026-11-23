// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#1056: an extra photo added on the edit screen (held in the draft, unsaved) vanished after
// a trip to the map screen. Opening that screen UNMOUNTS this one and Back rebuilds it, and the
// extras block was gated on two reads made afresh on every mount (the membership check, then the
// website read of the entry's edit page), so until both had answered, or for good if one failed,
// the draft's pending photos were not shown (and Save looked as though it would drop them).

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTrackedRouter } from '../../../app/routes/test-router.js';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { EditEntryScreen } from '../EditEntryScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { resumeClear } from '../../../data/resumeCache.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';

const { fetchEntry } = vi.hoisted(() => ({ fetchEntry: vi.fn() }));
vi.mock('../../../data/entries.js', () => ({ fetchEntry, deleteEntry: vi.fn() }));
const { fetchUserProfile } = vi.hoisted(() => ({ fetchUserProfile: vi.fn() }));
vi.mock('../../../data/users.js', () => ({ fetchUserProfile }));
vi.mock('../../../flows/composeFlow.js', () => ({
  submitDraft: vi.fn(),
  describeSubmitError: () => 'x',
}));
vi.mock('../../../platform/siteSession.js', () => ({ siteSessionAvailable: () => true }));
const { loadEditExtras } = vi.hoisted(() => ({ loadEditExtras: vi.fn() }));
vi.mock('../../../flows/extrasFlow.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../flows/extrasFlow.js')>()),
  loadEditExtras,
}));
const { pickPhoto } = vi.hoisted(() => ({ pickPhoto: vi.fn() }));
vi.mock('../../../platform/camera.js', () => ({ pickPhoto }));
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace: vi.fn(), goBack: vi.fn(), goBackOr: vi.fn() }),
}));

const OK = { kind: 'ok', items: [], remaining: 90 } as const;

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
  resumeClear();
  fetchUserProfile.mockResolvedValue({ details: { member: 1 } });
  loadEditExtras.mockResolvedValue(OK);
  pickPhoto.mockResolvedValue({
    webPath: 'blob:extra-1',
    mimeType: 'image/jpeg',
    width: 800,
    height: 600,
    createdAt: null,
    sizeBytes: 1000,
  });
  fetchEntry.mockResolvedValue({
    entry: {
      entry_id: 'e1',
      date: '2026-01-01',
      title: 'Sunrise',
      username: 'me',
      description: '',
      tags: [],
      location: null,
      images: {},
    },
    actions: null,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function mount() {
  const { wrap } = createTrackedRouter();
  render(
    wrap(
      <OverlayProvider>
        <EditEntryScreen entryId="e1" />
      </OverlayProvider>,
    ),
  );
}

describe('an extra photo added on the edit screen, across a round trip', () => {
  it('is still shown while the membership check is pending on the way back', async () => {
    mount();
    await userEvent.click(await screen.findByLabelText('Add an extra photo'));
    await screen.findByAltText('New extra photo 1');

    cleanup();
    resumeClear(); // as if the remembered answer had expired
    fetchUserProfile.mockReturnValue(new Promise(() => {}));
    mount();
    await screen.findByDisplayValue('Sunrise');
    expect(screen.getByAltText('New extra photo 1')).toBeDefined();
  });

  it('is still shown when the membership check fails on the way back', async () => {
    mount();
    await userEvent.click(await screen.findByLabelText('Add an extra photo'));
    await screen.findByAltText('New extra photo 1');

    cleanup();
    resumeClear(); // as if the remembered answer had expired
    fetchUserProfile.mockRejectedValue(new Error('offline'));
    mount();
    await screen.findByDisplayValue('Sunrise');
    expect(await screen.findByAltText('New extra photo 1')).toBeDefined();
  });

  it('is shown at once on the way back, without reading the entry from the website again', async () => {
    mount();
    await userEvent.click(await screen.findByLabelText('Add an extra photo'));
    await screen.findByAltText('New extra photo 1');
    expect(loadEditExtras).toHaveBeenCalledTimes(1);

    cleanup();
    loadEditExtras.mockReturnValue(new Promise(() => {}));
    mount();
    expect(await screen.findByAltText('New extra photo 1')).toBeDefined();
    expect(screen.queryByText('Loading extra photos…')).toBeNull();
    expect(loadEditExtras).toHaveBeenCalledTimes(1);
  });
});
