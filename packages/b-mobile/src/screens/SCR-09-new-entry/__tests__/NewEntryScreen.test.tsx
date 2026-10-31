// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { NewEntryScreen } from '../NewEntryScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';

// Full replacement, not a partial importOriginal spread — platform/camera.ts imports
// @capacitor/camera at module scope, which this avoids ever loading in jsdom (same "mock at the
// boundary" convention every other platform/** consumer test uses, e.g. MapScreen's map library
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

// The webcam route (desktop, b-oss#670): the view itself is covered in WebcamCapture's own test; here
// a stub that "uses" a fixed photo shows the screen wires it into the same draft path.
const { hasWebcam } = vi.hoisted(() => ({ hasWebcam: vi.fn() }));
vi.mock('../../../platform/webcam.js', () => ({ hasWebcam }));
vi.mock('../../../components/WebcamCapture.js', () => ({
  WebcamCapture: ({
    open,
    onUse,
  }: {
    open: boolean;
    onUse: (p: Record<string, unknown>) => void;
  }) =>
    open ? (
      <button
        onClick={() =>
          onUse({
            webPath: 'blob:webcam',
            mimeType: 'image/jpeg',
            width: 640,
            height: 480,
            createdAt: '2026-03-04T10:00:00Z',
            sizeBytes: 10,
          })
        }
      >
        stub use photo
      </button>
    ) : null,
}));

const push = vi.fn();
const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack }),
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

function renderScreen(replaceEntryId?: string) {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <NewEntryScreen replaceEntryId={replaceEntryId} />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

// Capabilities under test: the jsdom default is `web` (location and camera both available); the
// pick-only / files-only cases flip these (b-oss#636).
const caps = vi.hoisted(
  (): {
    location: 'os' | 'pick-only';
    capture: 'camera' | 'files-only';
    source: 'system' | 'webcam';
  } => ({
    location: 'os',
    capture: 'camera',
    source: 'system',
  }),
);
vi.mock('../../../platform/capabilities.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../platform/capabilities.js')>();
  return {
    ...real,
    capabilities: () => ({
      ...real.capabilities(),
      location: caps.location,
      media: { capture: caps.capture, source: caps.source },
    }),
  };
});
afterEach(() => {
  caps.location = 'os';
  caps.capture = 'camera';
  caps.source = 'system';
  hasWebcam.mockReset();
});

describe('NewEntryScreen', () => {
  it('replace mode: a pick patches the open edit draft and goes back, without starting a new entry', async () => {
    useComposeDraftStore.setState({
      draft: {
        mode: 'edit',
        accountId: 'a1',
        entryId: 'e1',
        photo: null,
        title: 'Sunrise',
        tags: '',
        description: '',
        date: '2026-01-01',
        location: null,
        displayLocation: false,
        thumbnailCrop: null,
        dirty: false,
      },
    });
    pickPhoto.mockResolvedValue({
      uri: 'file:///new.jpg',
      webPath: 'blob:new',
      mimeType: 'image/jpeg',
      width: 1600,
      height: 1200,
      createdAt: null,
      sizeBytes: null,
    });
    renderScreen('e1');
    expect(takePendingSharedPhoto).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Choose from device'));

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
    expect(useComposeDraftStore.getState().draft).toMatchObject({
      mode: 'edit',
      title: 'Sunrise',
      photo: { webPath: 'blob:new' },
      dirty: true,
    });
  });

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

  it("keeps the photo's embedded position in the draft but leaves the map off", async () => {
    pickPhoto.mockResolvedValue({
      uri: '/cache/PICK_1.jpg',
      webPath: 'https://localhost/_capacitor_file_/cache/PICK_1.jpg',
      mimeType: 'image/jpeg',
      width: 4000,
      height: 3000,
      createdAt: '2026-10-29T19:09:41+00:00',
      gps: { lat: 55.99228, lon: -3.4103951 },
    });
    renderScreen();
    await userEvent.click(screen.getByText('Choose from device'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/details'));
    const draft = useComposeDraftStore.getState().draft;
    expect(draft?.location).toEqual({ lat: 55.99228, lon: -3.4103951 });
    expect(draft?.displayLocation).toBe(false);
  });

  it('never invents a position: a photo without GPS starts with no location', async () => {
    pickPhoto.mockResolvedValue({
      webPath: 'blob:picked',
      mimeType: 'image/jpeg',
      width: 400,
      height: 400,
      createdAt: null,
      gps: null,
    });
    renderScreen();
    await userEvent.click(screen.getByText('Choose from device'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/details'));
    expect(useComposeDraftStore.getState().draft?.location).toBeNull();
  });
});

describe('NewEntryScreen without a camera route (desktop, b-oss#636)', () => {
  it('offers only a choose-a-photo action, labelled for what it does, and no browser/picker copy', async () => {
    caps.capture = 'files-only';
    pickPhoto.mockResolvedValue(null);
    renderScreen();
    expect(screen.queryByText('Take a photo')).toBeNull();
    expect(screen.queryByText('Choose from device')).toBeNull();
    expect(screen.queryByText(/system picker/i)).toBeNull();
    await userEvent.click(screen.getByText('Choose a photo'));
    expect(pickPhoto).toHaveBeenCalled();
    expect(takePhoto).not.toHaveBeenCalled();
  });

  it('with a camera it is unchanged: both tiles, the original label', () => {
    renderScreen();
    expect(screen.getByText('Take a photo')).toBeDefined();
    expect(screen.getByText('Choose from device')).toBeDefined();
  });
});

describe('NewEntryScreen with a webcam route (desktop, b-oss#670)', () => {
  beforeEach(() => {
    caps.source = 'webcam';
  });

  it('offers Take a photo once a webcam is found and seeds the draft from the captured photo', async () => {
    hasWebcam.mockResolvedValue(true);
    renderScreen();
    await userEvent.click(await screen.findByText('Take a photo'));
    expect(takePhoto).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('stub use photo'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/compose/details'));
    expect(useComposeDraftStore.getState().draft?.photo?.webPath).toBe('blob:webcam');
    expect(useComposeDraftStore.getState().draft?.date).toBe('2026-03-04');
  });

  it('with no webcam only Choose a photo is offered, never an error', async () => {
    hasWebcam.mockResolvedValue(false);
    renderScreen();
    await waitFor(() => expect(hasWebcam).toHaveBeenCalled());
    expect(screen.queryByText('Take a photo')).toBeNull();
    expect(screen.getByText('Choose a photo')).toBeDefined();
  });
});
