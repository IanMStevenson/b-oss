// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProfileSection } from '../sections/ProfileSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { CameraPermissionDeniedError } from '../../../platform/camera.js';
import { BlipfotoError } from '@b-oss/b-api';

const { fetchUserSettings, saveUserSettings } = vi.hoisted(() => ({
  fetchUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}));
vi.mock('../../../data/settings.js', () => ({ fetchUserSettings, saveUserSettings }));

const { takePhoto, pickPhoto } = vi.hoisted(() => ({ takePhoto: vi.fn(), pickPhoto: vi.fn() }));
vi.mock('../../../platform/camera.js', async () => {
  const actual = await vi.importActual<typeof import('../../../platform/camera.js')>(
    '../../../platform/camera.js',
  );
  return { ...actual, takePhoto, pickPhoto };
});

const { cropToJpegBlob } = vi.hoisted(() => ({ cropToJpegBlob: vi.fn() }));
vi.mock('../../../data/imageCrop.js', () => ({ cropToJpegBlob }));

vi.mock('../../../components/PhotoCropper.js', () => ({
  PhotoCropper: ({
    onCropAreaChange,
  }: {
    onCropAreaChange: (percent: unknown, pixels: unknown) => void;
  }) => (
    <button
      onClick={() =>
        onCropAreaChange(
          { x: 0, y: 0, width: 50, height: 50 },
          { x: 0, y: 0, width: 200, height: 200 },
        )
      }
    >
      mock-crop-area
    </button>
  ),
}));

const push = vi.fn();
const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack }),
}));

interface TestAccount {
  id: string;
  username: string;
  avatarUrl: string | null;
  appTokenScope: 'read' | 'read,write' | null;
  hasServiceToken: boolean;
  notificationRegistrationId: string | null;
  notificationStatus: 'active' | 'read-token-invalid' | null;
}

function account(overrides: Partial<TestAccount> = {}): TestAccount {
  return {
    id: 'a1',
    username: 'alice',
    avatarUrl: null,
    appTokenScope: 'read,write',
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
    ...overrides,
  };
}

beforeEach(() => {
  useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1', hydrated: true });
  fetchUserSettings.mockResolvedValue({
    username: 'alice',
    journal_title: 'My journal',
    real_name: '',
    real_name_search: 0,
    biography: '',
    locale_code: 'en',
    country_code: 'gb',
    privacy: 0,
    comments: 1,
    avatar_url: '',
  });
  saveUserSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <ProfileSection />
    </MemoryRouter>,
  );
}

describe('ProfileSection', () => {
  it('shows a loading state, then the loaded username and no-avatar message', async () => {
    renderScreen();
    expect(await screen.findByText('No avatar set.')).toBeDefined();
    expect(screen.getByDisplayValue('alice')).toBeDefined();
  });

  it('shows an error state when the load fails', async () => {
    fetchUserSettings.mockRejectedValue(new BlipfotoError(500, 'Server error'));
    renderScreen();
    expect(await screen.findByText('Server error')).toBeDefined();
  });

  it('Save is disabled until the username actually changes, then saves it', async () => {
    renderScreen();
    const input = await screen.findByDisplayValue('alice');
    const saveButton = screen.getByText('Save', { selector: 'ion-button' });
    expect(saveButton).toHaveProperty('disabled', true);

    await userEvent.clear(input);
    await userEvent.type(input, 'alice2');
    await userEvent.click(saveButton);

    await waitFor(() => expect(saveUserSettings).toHaveBeenCalledWith({ username: 'alice2' }));
    expect(goBack).toHaveBeenCalled();
  });

  it('read-only accounts see the username with no Save affordance', async () => {
    useAccountsStore.setState({
      accounts: [account({ appTokenScope: 'read' })],
      activeAccountId: 'a1',
    });
    renderScreen();
    await screen.findByDisplayValue('alice');
    expect(screen.queryByText('Save', { selector: 'ion-button' })).toBeNull();
    expect(screen.getByText('This account is read-only.')).toBeDefined();
    expect(screen.queryByText('Take photo', { selector: 'ion-button' })).toBeNull();
  });

  it('links out to the biography editor in bio mode', async () => {
    renderScreen();
    await screen.findByDisplayValue('alice');
    await userEvent.click(screen.getByText('Edit biography'));
    expect(push).toHaveBeenCalledWith('/compose/description?target=bio');
  });

  it('takes a photo, crops it, and uploads the cropped avatar', async () => {
    takePhoto.mockResolvedValue({
      webPath: 'blob:photo',
      mimeType: 'image/jpeg',
      width: 400,
      height: 400,
      createdAt: null,
    });
    const fakeBlob = new Blob(['x'], { type: 'image/jpeg' });
    cropToJpegBlob.mockResolvedValue(fakeBlob);

    renderScreen();
    await screen.findByText('No avatar set.');

    await userEvent.click(screen.getByText('Take photo', { selector: 'ion-button' }));
    await screen.findByText('mock-crop-area');
    await userEvent.click(screen.getByText('mock-crop-area'));
    await userEvent.click(screen.getByText('Use this photo'));

    await waitFor(() =>
      expect(saveUserSettings).toHaveBeenCalledWith({ avatar: { blob: fakeBlob } }),
    );
    // refreshFromServer re-fetches after a successful avatar save.
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalledTimes(2));
  });

  it('shows a specific message when camera permission is refused, and leaves choose usable', async () => {
    takePhoto.mockRejectedValue(new CameraPermissionDeniedError(true));
    renderScreen();
    await screen.findByText('No avatar set.');

    await userEvent.click(screen.getByText('Take photo', { selector: 'ion-button' }));
    expect(
      await screen.findByText(
        'Camera access is needed to take a photo. Please allow it and try again.',
      ),
    ).toBeDefined();
    expect(screen.getByText('Choose from device', { selector: 'ion-button' })).toBeDefined();
  });

  it('deletes the avatar after confirming', async () => {
    fetchUserSettings.mockResolvedValue({
      username: 'alice',
      journal_title: '',
      real_name: '',
      real_name_search: 0,
      biography: '',
      locale_code: 'en',
      country_code: 'gb',
      privacy: 0,
      comments: 1,
      avatar_url: 'https://example.com/avatar.jpg',
    });
    renderScreen();
    await screen.findByAltText('Current avatar');

    await userEvent.click(screen.getByText('Delete avatar', { selector: 'ion-button' }));
    const confirmButton = document.querySelector(
      'ion-alert[header="Delete avatar?"] button.alert-button-role-destructive',
    ) as HTMLElement;
    await userEvent.click(confirmButton);

    await waitFor(() => expect(saveUserSettings).toHaveBeenCalledWith({ delete_avatar: 1 }));
  });
});
