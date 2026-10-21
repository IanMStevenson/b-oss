// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// @vitest-environment jsdom

// The first device run of "Download photo" failed with "Source image not found" because the native
// plugin was handed a WebView URL (https://localhost/_capacitor_file_/…) instead of a file:// URI.
// This pins what crosses the JS/native boundary.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const saveImage = vi.fn<(o: { uri: string; fileName: string }) => Promise<{ location: string }>>();
let native = true;
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native,
    convertFileSrc: (uri: string) =>
      `https://localhost/_capacitor_file_${uri.replace('file://', '')}`,
  },
  registerPlugin: () => ({ saveImage: (o: { uri: string; fileName: string }) => saveImage(o) }),
}));

const deleteFile = vi.fn<(o: unknown) => Promise<void>>().mockResolvedValue(undefined);
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    deleteFile: (o: unknown) => deleteFile(o),
    getUri: ({ path }: { path: string }) =>
      Promise.resolve({ uri: `file:///data/user/0/app/cache/${path}` }),
  },
}));

const downloadFile = vi.fn<(o: unknown) => Promise<void>>().mockResolvedValue(undefined);
vi.mock('@capacitor/file-transfer', () => ({
  FileTransfer: { downloadFile: (o: unknown) => downloadFile(o) },
}));

let verdict: { ok: true } | { ok: false; reason: string } = { ok: true };
vi.mock('../imageIntegrity.js', () => ({ checkImageIntegrity: () => verdict }));

import { saveRemoteImageToGallery } from '../mediaSave.js';

beforeEach(() => {
  vi.clearAllMocks();
  native = true;
  verdict = { ok: true };
  saveImage.mockResolvedValue({ location: 'Pictures/b-mobile/x.jpg' });
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  );
});

describe('saveRemoteImageToGallery', () => {
  it('downloads to a temp file and hands the plugin a file:// URI (not a WebView URL), then cleans up', async () => {
    const where = await saveRemoteImageToGallery('https://cdn.example/p.jpg', 'blipfoto-a-1');
    expect(downloadFile).toHaveBeenCalledWith({
      url: 'https://cdn.example/p.jpg',
      path: 'file:///data/user/0/app/cache/downloads/blipfoto-a-1',
    });
    const arg = saveImage.mock.calls[0]?.[0];
    expect(arg?.uri).toBe('file:///data/user/0/app/cache/downloads/blipfoto-a-1');
    expect(arg?.uri.startsWith('https://')).toBe(false);
    expect(arg?.fileName).toBe('blipfoto-a-1');
    expect(where).toBe('Pictures/b-mobile/x.jpg');
    expect(deleteFile).toHaveBeenLastCalledWith({
      path: 'downloads/blipfoto-a-1',
      directory: 'CACHE',
    });
  });

  it('refuses to save an incomplete download, and does not call the plugin', async () => {
    verdict = { ok: false, reason: 'truncated JPEG' };
    await expect(saveRemoteImageToGallery('https://cdn.example/p.jpg', 'n')).rejects.toThrow(
      /incomplete/,
    );
    expect(saveImage).not.toHaveBeenCalled();
  });

  it('still removes the temp file if the plugin fails', async () => {
    saveImage.mockRejectedValue(new Error('Could not save the image: disk full'));
    await expect(saveRemoteImageToGallery('https://cdn.example/p.jpg', 'n')).rejects.toThrow(
      /disk full/,
    );
    expect(deleteFile).toHaveBeenLastCalledWith({ path: 'downloads/n', directory: 'CACHE' });
  });

  it('off-device just opens the image', async () => {
    native = false;
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(await saveRemoteImageToGallery('https://cdn.example/p.jpg', 'n')).toBeNull();
    expect(open).toHaveBeenCalledWith('https://cdn.example/p.jpg', '_blank', 'noopener');
    expect(saveImage).not.toHaveBeenCalled();
  });
});
