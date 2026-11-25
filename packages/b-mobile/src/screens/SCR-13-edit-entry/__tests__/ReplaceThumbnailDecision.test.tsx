// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#1062: replacing an entry's photo AND choosing its thumbnail. The API ignores the selection on
// a replaced photo, so Save asks the member what to do instead of sending it.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTrackedRouter } from '../../../app/routes/test-router.js';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { EditEntryScreen } from '../EditEntryScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useComposeDraftStore, type ComposeDraft } from '../../../state/composeDraftStore.js';

const isOnline = vi.hoisted(() => vi.fn());
vi.mock('../../../platform/connectivity.js', () => ({ isOnline }));
const { fetchEntry, deleteEntry } = vi.hoisted(() => ({
  fetchEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));
vi.mock('../../../data/entries.js', () => ({ fetchEntry, deleteEntry }));
const { fetchUserProfile } = vi.hoisted(() => ({ fetchUserProfile: vi.fn() }));
vi.mock('../../../data/users.js', () => ({ fetchUserProfile }));
const { submitDraft } = vi.hoisted(() => ({ submitDraft: vi.fn() }));
vi.mock('../../../flows/composeFlow.js', () => ({
  submitDraft,
  describeSubmitError: (err: unknown) => (err instanceof Error ? err.message : 'x'),
}));
const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock('../../../platform/browser.js', () => ({ openUrl }));

const replace = vi.fn();
const goBack = vi.fn();
const goBackOr = vi.fn();
const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace, goBack, goBackOr }),
}));

const photo = {
  webPath: 'blob:new',
  mimeType: 'image/jpeg',
  width: 1600,
  height: 1000,
  createdAt: null,
  sizeBytes: 1000,
};

function seedDraft(patch: Partial<ComposeDraft> = {}): void {
  useComposeDraftStore.setState({
    draft: {
      mode: 'edit',
      accountId: 'a1',
      entryId: 'e1',
      editLevel: 1,
      photo,
      title: 'Sunrise',
      tags: 'dawn',
      description: 'D',
      date: '2026-01-01',
      originalDate: '2026-01-01',
      location: null,
      displayLocation: false,
      thumbnailCrop: { x: 0.3, y: 0.2, w: 0.4 }, // not the default: the member chose it
      dirty: true,
      ...patch,
    },
  });
}

beforeEach(() => {
  fetchUserProfile.mockResolvedValue({ details: { member: 1 } });
  isOnline.mockResolvedValue(true);
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
});

afterEach(() => {
  cleanup();
  // Ionic alerts are portalled onto <body>, outside what cleanup() removes.
  document.querySelectorAll('ion-alert').forEach((alert) => alert.remove());
  vi.resetAllMocks();
});

function renderScreen(): void {
  const { wrap } = createTrackedRouter();
  render(
    wrap(
      <OverlayProvider>
        <EditEntryScreen entryId="e1" />
      </OverlayProvider>,
    ),
  );
}

async function pressSave(): Promise<void> {
  await userEvent.click(await screen.findByText('Save'));
}

describe('saving a replacement photo with a chosen thumbnail', () => {
  it('shows the decision screen and sends nothing', async () => {
    seedDraft();
    renderScreen();
    await pressSave();
    expect(
      await screen.findByText(/doesn't accept thumbnail edits on replacement images/),
    ).toBeDefined();
    expect(screen.getByText('Continue posting with the default thumbnail')).toBeDefined();
    expect(
      screen.getByText('Delete the current entry and upload your changes as a replacement entry'),
    ).toBeDefined();
    expect(screen.getByText('Cancel the edits (lose any changes you made)')).toBeDefined();
    expect(submitDraft).not.toHaveBeenCalled();
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it('links to the entry on the website', async () => {
    seedDraft();
    renderScreen();
    await pressSave();
    await userEvent.click(await screen.findByText('website'));
    expect(openUrl).toHaveBeenCalledWith('https://www.blipfoto.com/entry/e1/edit');
  });

  it('does not ask when the thumbnail is still the default, or no photo was replaced', async () => {
    seedDraft({ thumbnailCrop: null });
    submitDraft.mockResolvedValue('e1');
    renderScreen();
    await pressSave();
    await waitFor(() => expect(submitDraft).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/doesn't accept thumbnail edits/)).toBeNull();
  });

  it('1: continues, and the selection is not sent', async () => {
    seedDraft();
    submitDraft.mockResolvedValue('e1');
    renderScreen();
    await pressSave();
    await userEvent.click(await screen.findByText('Continue posting with the default thumbnail'));
    await waitFor(() => expect(submitDraft).toHaveBeenCalledTimes(1));
    expect(submitDraft.mock.calls[0]?.[0]).toMatchObject({ mode: 'edit', thumbnailCrop: null });
    expect(deleteEntry).not.toHaveBeenCalled();
    await waitFor(() => expect(goBackOr).toHaveBeenCalledWith('/entry/e1'));
  });

  it('3: asks the usual "Discard changes?" question, then cancels the edits', async () => {
    seedDraft();
    renderScreen();
    await pressSave();
    await userEvent.click(await screen.findByText('Cancel the edits (lose any changes you made)'));
    expect(await screen.findByText('Discard changes?')).toBeDefined();
    // Not yet: the question comes first.
    expect(useComposeDraftStore.getState().draft).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(useComposeDraftStore.getState().draft).toBeNull();
    expect(goBack).toHaveBeenCalled();
    expect(submitDraft).not.toHaveBeenCalled();
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it('3: Keep editing leaves the decision screen as it was', async () => {
    seedDraft();
    renderScreen();
    await pressSave();
    await userEvent.click(await screen.findByText('Cancel the edits (lose any changes you made)'));
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(useComposeDraftStore.getState().draft).not.toBeNull();
    expect(await screen.findByText('Continue posting with the default thumbnail')).toBeDefined();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('2: asks once more, then deletes the entry and posts the edits as a new one', async () => {
    seedDraft();
    const order: string[] = [];
    deleteEntry.mockImplementation(() => {
      order.push('delete');
      return Promise.resolve();
    });
    submitDraft.mockImplementation(() => {
      order.push('publish');
      return Promise.resolve('new1');
    });
    renderScreen();
    await pressSave();
    await userEvent.click(
      await screen.findByText(
        'Delete the current entry and upload your changes as a replacement entry',
      ),
    );
    // Irreversible: nothing happens until it is confirmed.
    expect(deleteEntry).not.toHaveBeenCalled();
    expect(await screen.findByText('Delete this entry and post it again?')).toBeDefined();
    await userEvent.click(screen.getByText('Delete and post as a new entry'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/entry/new1'));
    expect(order).toEqual(['delete', 'publish']);
    expect(deleteEntry).toHaveBeenCalledWith('e1');
    expect(submitDraft.mock.calls[0]?.[0]).toMatchObject({
      mode: 'publish',
      title: 'Sunrise',
      date: '2026-01-01',
      thumbnailCrop: { x: 0.3, y: 0.2, w: 0.4 },
    });
    expect(useComposeDraftStore.getState().draft).toBeNull();
  });

  it('2: Back from the confirmation changes nothing', async () => {
    seedDraft();
    renderScreen();
    await pressSave();
    await userEvent.click(
      await screen.findByText(
        'Delete the current entry and upload your changes as a replacement entry',
      ),
    );
    await userEvent.click(await screen.findByText('Back'));
    expect(await screen.findByText('Continue posting with the default thumbnail')).toBeDefined();
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it('2: if the delete fails, nothing has changed and the member can choose again', async () => {
    seedDraft();
    deleteEntry.mockRejectedValue(new Error('Could not delete'));
    renderScreen();
    await pressSave();
    await userEvent.click(
      await screen.findByText(
        'Delete the current entry and upload your changes as a replacement entry',
      ),
    );
    await userEvent.click(await screen.findByText('Delete and post as a new entry'));
    expect(await screen.findByText('Could not delete')).toBeDefined();
    expect(submitDraft).not.toHaveBeenCalled();
    expect(useComposeDraftStore.getState().draft?.mode).toBe('edit');
  });

  it('2: if the new post fails after the delete, every edit is kept as a new-entry draft', async () => {
    seedDraft();
    deleteEntry.mockResolvedValue(undefined);
    submitDraft.mockRejectedValue(new Error('Upload failed'));
    renderScreen();
    await pressSave();
    await userEvent.click(
      await screen.findByText(
        'Delete the current entry and upload your changes as a replacement entry',
      ),
    );
    await userEvent.click(await screen.findByText('Delete and post as a new entry'));
    expect(
      await screen.findByText('The entry was deleted, but the new one was not posted'),
    ).toBeDefined();
    expect(screen.getByText('Upload failed')).toBeDefined();
    const kept = useComposeDraftStore.getState().draft;
    expect(kept).toMatchObject({ mode: 'publish', title: 'Sunrise', date: '2026-01-01', photo });
    await userEvent.click(screen.getByText('Continue'));
    expect(replace).toHaveBeenCalledWith('/compose/details');
  });

  describe('Back stays inside the edit', () => {
    /** What Ionic does on the Android Back button: runs the highest priority handler registered. */
    function pressHardwareBack(): ReturnType<typeof vi.fn<() => void>> {
      const handlers: Array<{ priority: number; run: (next: () => void) => void }> = [];
      document.dispatchEvent(
        new CustomEvent('ionBackButton', {
          detail: {
            register: (priority: number, run: (next: () => void) => void) =>
              handlers.push({ priority, run }),
          },
        }),
      );
      const next = vi.fn<() => void>();
      const top = handlers.sort((a, b) => b.priority - a.priority)[0];
      if (top) top.run(next);
      else next();
      return next;
    }

    // The header's arrow (the screen also has a "Back" button of its own on the red page).
    const headerBack = (): HTMLElement => {
      const arrow = document.querySelector<HTMLElement>('ion-back-button');
      if (!arrow) throw new Error('no header Back button');
      return arrow;
    };
    const openConfirmation = async (): Promise<void> => {
      await pressSave();
      await userEvent.click(
        await screen.findByText(
          'Delete the current entry and upload your changes as a replacement entry',
        ),
      );
      await screen.findByText('Delete this entry and post it again?');
    };

    it('the header Back goes from the red page to the options, then to the form, never out', async () => {
      seedDraft();
      renderScreen();
      await openConfirmation();
      await userEvent.click(headerBack());
      expect(await screen.findByText('Continue posting with the default thumbnail')).toBeDefined();
      await userEvent.click(headerBack());
      expect(await screen.findByDisplayValue('Sunrise')).toBeDefined(); // the form again
      expect(screen.queryByText('Continue posting with the default thumbnail')).toBeNull();
      expect(goBack).not.toHaveBeenCalled();
      expect(useComposeDraftStore.getState().draft).not.toBeNull();
    });

    it('the Android Back does the same, and the router never goes back', async () => {
      seedDraft();
      renderScreen();
      await openConfirmation();
      const first = pressHardwareBack();
      expect(await screen.findByText('Continue posting with the default thumbnail')).toBeDefined();
      const second = pressHardwareBack();
      expect(await screen.findByDisplayValue('Sunrise')).toBeDefined();
      expect(first).not.toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
      expect(goBack).not.toHaveBeenCalled();
      expect(useComposeDraftStore.getState().draft).not.toBeNull();
    });

    it('the decision starts on its options again after Back and Save', async () => {
      seedDraft();
      renderScreen();
      await openConfirmation();
      await userEvent.click(headerBack());
      await userEvent.click(headerBack());
      await pressSave();
      expect(await screen.findByText('Continue posting with the default thumbnail')).toBeDefined();
      expect(screen.queryByText('Delete this entry and post it again?')).toBeNull();
    });

    it('does nothing while the delete and post are running', async () => {
      seedDraft();
      deleteEntry.mockReturnValue(new Promise(() => {})); // never settles
      renderScreen();
      await openConfirmation();
      await userEvent.click(screen.getByText('Delete and post as a new entry'));
      const next = pressHardwareBack();
      expect(next).not.toHaveBeenCalled();
      expect(screen.getByText('Delete this entry and post it again?')).toBeDefined();
    });
  });
});
