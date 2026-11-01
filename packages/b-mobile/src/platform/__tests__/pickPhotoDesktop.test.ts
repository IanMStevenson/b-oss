// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, describe, expect, it, vi } from 'vitest';

const { desktopBridge, chooseFromGallery } = vi.hoisted(() => ({
  desktopBridge: vi.fn(),
  chooseFromGallery: vi.fn(),
}));

vi.mock('@capacitor/camera', () => ({
  Camera: { chooseFromGallery },
  CameraDirection: { Rear: 'REAR' },
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: {} }));
vi.mock('../photoPick.js', () => ({
  hasNativePhotoPick: () => false,
  pickNativePhoto: vi.fn(),
  readPhotoGps: vi.fn(),
}));
vi.mock('../desktop.js', () => ({ desktopBridge }));

import { pickPhoto } from '../camera.js';

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('pickPhoto on the desktop shell (b-oss#739)', () => {
  it('asks the shell for the account and maps the file to a PickedPhoto', async () => {
    const pick = vi.fn().mockResolvedValue({
      name: 'a.jpg',
      mimeType: 'image/jpeg',
      modifiedMs: Date.UTC(2026, 9, 1),
      bytes: new Uint8Array([1, 2, 3]),
    });
    desktopBridge.mockReturnValue({ pickPhoto: pick });
    vi.stubGlobal('createImageBitmap', () =>
      Promise.resolve({ width: 800, height: 600, close() {} }),
    );
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x' });

    const photo = await pickPhoto('acct-1');

    expect(pick).toHaveBeenCalledWith('acct-1');
    expect(chooseFromGallery).not.toHaveBeenCalled();
    expect(photo).toMatchObject({
      webPath: 'blob:x',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      sizeBytes: 3,
      createdAt: new Date(Date.UTC(2026, 9, 1)).toISOString(),
    });
  });

  it('returns null when the dialog is cancelled', async () => {
    desktopBridge.mockReturnValue({ pickPhoto: vi.fn().mockResolvedValue(null) });
    expect(await pickPhoto('acct-1')).toBeNull();
    expect(chooseFromGallery).not.toHaveBeenCalled();
  });

  it.each([
    ['no bridge (Android, browser)', undefined],
    ['an older shell without pickPhoto', {}],
  ])('keeps the existing picker with %s', async (_label, bridge) => {
    desktopBridge.mockReturnValue(bridge);
    chooseFromGallery.mockResolvedValue({ results: [] });
    expect(await pickPhoto('acct-1')).toBeNull();
    expect(chooseFromGallery).toHaveBeenCalled();
  });
});
