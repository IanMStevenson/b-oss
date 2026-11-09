// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, describe, expect, it, vi } from 'vitest';

const { camera, readExif } = vi.hoisted(() => ({
  camera: { chooseFromGallery: vi.fn() },
  readExif: vi.fn(),
}));

vi.mock('@capacitor/camera', () => ({ Camera: camera, CameraDirection: { Rear: 'REAR' } }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: {} }));
vi.mock('../photoPick.js', () => ({
  hasNativePhotoPick: () => false,
  pickNativePhoto: vi.fn(),
  readPhotoGps: vi.fn(),
}));
vi.mock('../exif.js', () => ({ readExif }));

import { pickPhoto } from '../camera.js';

const picked = {
  results: [{ webPath: 'blob:abc', metadata: { format: 'jpeg', resolution: '4000x3000' } }],
};

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('pickPhoto on the web path (b-oss#740)', () => {
  it('sets gps from the picked file’s EXIF', async () => {
    camera.chooseFromGallery.mockResolvedValue(picked);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }),
    );
    readExif.mockReturnValue({ gps: { lat: 51.5, lon: -0.1 }, date: '2026-09-30' });
    const photo = await pickPhoto();
    expect(photo?.gps).toEqual({ lat: 51.5, lon: -0.1 });
    expect(photo?.takenDate).toBe('2026-09-30');
  });

  it('still returns the photo, with no gps, when the file cannot be read', async () => {
    camera.chooseFromGallery.mockResolvedValue(picked);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('nope')));
    const photo = await pickPhoto();
    expect(photo?.webPath).toBe('blob:abc');
    expect(photo?.gps).toBeNull();
    expect(photo?.takenDate).toBeNull();
  });
});
