// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, describe, expect, it, vi } from 'vitest';

const { camera, geolocation, readPhotoGps, pickNativePhoto } = vi.hoisted(() => ({
  camera: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    takePhoto: vi.fn(),
  },
  geolocation: { checkPermissions: vi.fn(), requestPermissions: vi.fn() },
  readPhotoGps: vi.fn(),
  pickNativePhoto: vi.fn(),
}));

vi.mock('@capacitor/camera', () => ({
  Camera: camera,
  CameraDirection: { Rear: 'REAR' },
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: geolocation }));
vi.mock('../photoPick.js', () => ({
  hasNativePhotoPick: () => true,
  pickNativePhoto,
  readPhotoGps,
}));
vi.mock('@capacitor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => true, convertFileSrc: (p: string) => p },
}));

import { pickPhoto, takePhoto } from '../camera.js';

const capture = {
  uri: '/data/user/0/app/cache/PIC_1.jpg',
  webPath: 'https://localhost/PIC_1.jpg',
  metadata: { format: 'jpeg', resolution: '4000x3000' },
};

afterEach(() => vi.resetAllMocks());

function grantCamera(): void {
  camera.checkPermissions.mockResolvedValue({ camera: 'granted' });
  camera.takePhoto.mockResolvedValue(capture);
}

describe('takePhoto', () => {
  it('geotag: asks for approximate location first, then returns the position embedded in the capture', async () => {
    grantCamera();
    geolocation.checkPermissions.mockResolvedValue({
      location: 'prompt',
      coarseLocation: 'prompt',
    });
    geolocation.requestPermissions.mockResolvedValue({
      location: 'denied',
      coarseLocation: 'granted',
    });
    readPhotoGps.mockResolvedValue({ lat: 55.97, lon: -3.26 });

    const photo = await takePhoto({ geotag: true });

    expect(geolocation.requestPermissions).toHaveBeenCalledWith({
      permissions: ['coarseLocation'],
    });
    expect(readPhotoGps).toHaveBeenCalledWith(capture.uri);
    expect(photo?.gps).toEqual({ lat: 55.97, lon: -3.26 });
  });

  it('geotag: a refused location prompt still takes the photo, without a position', async () => {
    grantCamera();
    geolocation.checkPermissions.mockResolvedValue({
      location: 'denied',
      coarseLocation: 'denied',
    });
    readPhotoGps.mockResolvedValue(null);

    const photo = await takePhoto({ geotag: true });

    expect(geolocation.requestPermissions).not.toHaveBeenCalled();
    expect(photo).not.toBeNull();
    expect(photo?.gps).toBeNull();
  });

  it('without geotag (profile photo) never asks for location or reads a position', async () => {
    grantCamera();

    const photo = await takePhoto();

    expect(geolocation.checkPermissions).not.toHaveBeenCalled();
    expect(readPhotoGps).not.toHaveBeenCalled();
    expect(photo?.gps).toBeUndefined();
  });
});

describe('pickPhoto on Android (b-oss#992)', () => {
  const native = { path: '/cache/PICK_1.jpg', mimeType: 'image/jpeg', sizeBytes: 10 };

  it('uses the EXIF date when present, else the original’s modified time, else null', async () => {
    pickNativePhoto.mockResolvedValueOnce({
      ...native,
      createdAt: '2025-12-31T23:50:00+00:00',
      takenDate: '2025-12-31',
      modifiedMs: Date.UTC(2026, 0, 2),
    });
    const exif = await pickPhoto();
    expect(exif?.takenDate).toBe('2025-12-31');
    expect(exif?.createdAt).toBe('2025-12-31T23:50:00+00:00');

    pickNativePhoto.mockResolvedValueOnce({ ...native, modifiedMs: Date.UTC(2026, 0, 2) });
    const modified = await pickPhoto();
    expect(modified?.takenDate).toBeNull();
    expect(modified?.createdAt).toBe(new Date(Date.UTC(2026, 0, 2)).toISOString());

    pickNativePhoto.mockResolvedValueOnce(native);
    expect((await pickPhoto())?.createdAt).toBeNull();
  });
});
