// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, describe, expect, it, vi } from 'vitest';

const { camera, geolocation, readPhotoGps } = vi.hoisted(() => ({
  camera: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    takePhoto: vi.fn(),
  },
  geolocation: { checkPermissions: vi.fn(), requestPermissions: vi.fn() },
  readPhotoGps: vi.fn(),
}));

vi.mock('@capacitor/camera', () => ({
  Camera: camera,
  CameraDirection: { Rear: 'REAR' },
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: geolocation }));
vi.mock('../photoPick.js', () => ({
  hasNativePhotoPick: () => true,
  pickNativePhoto: vi.fn(),
  readPhotoGps,
}));
vi.mock('@capacitor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => true, convertFileSrc: (p: string) => p },
}));

import { takePhoto } from '../camera.js';

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
