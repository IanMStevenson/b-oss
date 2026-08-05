// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NewEntryScreen } from '../NewEntryScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';

// Full replacement, not a partial importOriginal spread — platform/camera.ts imports
// @capacitor/camera at module scope, which this avoids ever loading in jsdom (same "mock at the
// boundary" convention every other platform/** consumer test uses, e.g. MapScreen's maplibre-gl
// mock and every screen's platform/prefs.js mock below).
const { takePhoto, pickPhoto, CameraPermissionDeniedError } = vi.hoisted(() => {
  class CameraPermissionDeniedError extends Error {
    constructor(public readonly canRetry: boolean) {
      super('Camera access was refused.');
      this.name = 'CameraPermissionDeniedError';
    }
  }
  return { takePhoto: vi.fn(), pickPhoto: vi.fn(), CameraPermissionDeniedError };
});
vi.mock('../../../platform/camera.js', () => ({
  takePhoto,
  pickPhoto,
  isNativeCamera: () => true,
  CameraPermissionDeniedError,
}));

const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
}));

const { takePendingSharedPhoto } = vi.hoisted(() => ({ takePendingSharedPhoto: vi.fn() }));
vi.mock('../../../platform/shareIntent.js', () => ({ takePendingSharedPhoto }));

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
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <NewEntryScreen />
    </MemoryRouter>,
  );
}

describe('NewEntryScreen', () => {
  it('seeds the draft and continues to SCR-10 on a successful capture', async () => {
    takePhoto.mockResolvedValue({
      uri: 'file:///photo.jpg',
      webPath: 'blob:photo',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      createdAt: null,
    });
    renderScreen();
    await userEvent.click(screen.getByText('Take a photo'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/details'));
    expect(useComposeDraftStore.getState().draft).toMatchObject({
      mode: 'publish',
      accountId: 'a1',
      photo: { webPath: 'blob:photo', mimeType: 'image/jpeg' },
    });
  });

  it('returns to idle with no error on cancel (a null result)', async () => {
    takePhoto.mockResolvedValue(null);
    renderScreen();
    await userEvent.click(screen.getByText('Take a photo'));
    await waitFor(() => expect(takePhoto).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(/needs camera access/i)).toBeNull();
  });

  it('explains a camera permission refusal without blocking "Choose from device"', async () => {
    takePhoto.mockRejectedValue(new CameraPermissionDeniedError(true));
    renderScreen();
    await userEvent.click(screen.getByText('Take a photo'));

    expect(await screen.findByText(/needs camera access/i)).toBeDefined();
    const pickButton = screen.getByText('Choose from device').closest('ion-button')!;
    expect(pickButton.hasAttribute('disabled')).toBe(false);
  });

  it('shows a validation-style message and stays on the screen for an unusable photo error', async () => {
    pickPhoto.mockRejectedValue(new Error('Could not read that file.'));
    renderScreen();
    await userEvent.click(screen.getByText('Choose from device'));
    expect(await screen.findByText('Could not read that file.')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it('FLW-12: a pending shared photo seeds the draft on mount, with no camera/picker interaction', async () => {
    takePendingSharedPhoto.mockReturnValue({
      uri: 'file:///cache/shared/shared-1.jpg',
      webPath: 'file:///cache/shared/shared-1.jpg',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 900,
      createdAt: null,
      sizeBytes: 45000,
    });
    renderScreen();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/details'));
    expect(useComposeDraftStore.getState().draft).toMatchObject({
      mode: 'publish',
      accountId: 'a1',
      photo: { webPath: 'file:///cache/shared/shared-1.jpg', mimeType: 'image/jpeg' },
    });
    expect(takePhoto).not.toHaveBeenCalled();
    expect(pickPhoto).not.toHaveBeenCalled();
  });

  it('does nothing extra on mount when there is no pending shared photo', () => {
    takePendingSharedPhoto.mockReturnValue(null);
    renderScreen();
    expect(push).not.toHaveBeenCalled();
    expect(useComposeDraftStore.getState().draft).toBeNull();
  });

  it('picking from device seeds the draft the same way', async () => {
    pickPhoto.mockResolvedValue({
      uri: undefined,
      webPath: 'blob:picked',
      mimeType: 'image/png',
      width: 400,
      height: 400,
      createdAt: '2026-02-01T10:00:00Z',
    });
    renderScreen();
    await userEvent.click(screen.getByText('Choose from device'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/details'));
    expect(useComposeDraftStore.getState().draft?.date).toBe('2026-02-01');
  });
});
