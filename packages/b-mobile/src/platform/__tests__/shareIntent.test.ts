// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-12's share-to-Blipfoto entry point (§16) — direct test, same reasoning as
// platform/http.test.ts: the checkForSharedImage()/takePendingSharedPhoto() split exists
// specifically to survive WriteGuardRoute's async gate between AppShell (where the native,
// one-shot consumption happens) and NewEntryScreen (where the cached result is picked up), which
// is exactly the kind of thing worth a direct test rather than only exercising indirectly.

import { afterEach, describe, expect, it, vi } from 'vitest';

let isNative = true;
const getSharedImage = vi.fn<
  () => Promise<{
    path: string;
    mimeType?: string;
    width?: number;
    height?: number;
    sizeBytes?: number;
  }>
>();
const addListener = vi
  .fn<(event: string, handler: () => void) => Promise<{ remove: () => void }>>()
  .mockResolvedValue({
    remove: vi.fn(),
  });

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative },
  registerPlugin: () => ({
    getSharedImage: () => getSharedImage(),
    addListener: (event: string, handler: () => void) => addListener(event, handler),
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  isNative = true;
});

describe('checkForSharedImage / takePendingSharedPhoto', () => {
  it('returns false on web, never touching the native plugin', async () => {
    isNative = false;
    const { checkForSharedImage, takePendingSharedPhoto } = await import('../shareIntent.js');
    expect(await checkForSharedImage()).toBe(false);
    expect(getSharedImage).not.toHaveBeenCalled();
    expect(takePendingSharedPhoto()).toBeNull();
  });

  it('returns false and caches nothing when the native side has no shared image', async () => {
    getSharedImage.mockResolvedValue({ path: '' });
    const { checkForSharedImage, takePendingSharedPhoto } = await import('../shareIntent.js');
    expect(await checkForSharedImage()).toBe(false);
    expect(takePendingSharedPhoto()).toBeNull();
  });

  it('caches a real shared photo and hands it to the first take, never a second', async () => {
    getSharedImage.mockResolvedValue({
      path: 'file:///cache/shared/shared-1.jpg',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 900,
      sizeBytes: 45000,
    });
    const { checkForSharedImage, takePendingSharedPhoto } = await import('../shareIntent.js');

    expect(await checkForSharedImage()).toBe(true);
    const photo = takePendingSharedPhoto();
    expect(photo).toEqual({
      uri: 'file:///cache/shared/shared-1.jpg',
      webPath: 'file:///cache/shared/shared-1.jpg',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 900,
      createdAt: null,
      sizeBytes: 45000,
    });
    // One-shot — a second take after the first must not resurrect the same photo.
    expect(takePendingSharedPhoto()).toBeNull();
  });

  it('treats an unknown (zero/undefined) width or height as null, not 0', async () => {
    getSharedImage.mockResolvedValue({
      path: 'file:///cache/shared/shared-2.jpg',
      width: -1,
      height: -1,
    });
    const { checkForSharedImage, takePendingSharedPhoto } = await import('../shareIntent.js');
    await checkForSharedImage();
    const photo = takePendingSharedPhoto();
    expect(photo?.width).toBeNull();
    expect(photo?.height).toBeNull();
  });

  it('defaults mimeType to image/jpeg and sizeBytes to null when the native side omits them', async () => {
    getSharedImage.mockResolvedValue({ path: 'file:///cache/shared/shared-3.jpg' });
    const { checkForSharedImage, takePendingSharedPhoto } = await import('../shareIntent.js');
    await checkForSharedImage();
    const photo = takePendingSharedPhoto();
    expect(photo?.mimeType).toBe('image/jpeg');
    expect(photo?.sizeBytes).toBeNull();
  });
});

describe('onShareReceived', () => {
  it('is a no-op on web', async () => {
    isNative = false;
    const { onShareReceived } = await import('../shareIntent.js');
    const handler = vi.fn();
    const off = onShareReceived(handler);
    expect(addListener).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });

  it('registers the native shareReceived listener', async () => {
    const { onShareReceived } = await import('../shareIntent.js');
    const handler = vi.fn();
    onShareReceived(handler);
    await Promise.resolve();
    expect(addListener).toHaveBeenCalledWith('shareReceived', handler);
  });
});
