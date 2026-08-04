// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — resolveImage()'s TTL arithmetic and fallback-on-error behaviour, explicitly
// named in §19's "this is where the density should be" list. Direct unit test (like
// platform/http.test.ts and platform/accessibility.test.ts) rather than only exercised through
// its one consumer (components/CachedImage.tsx, itself untested), since a cache miss silently
// becoming a broken image is exactly the class of bug this module exists to prevent.

import { afterEach, describe, expect, it, vi } from 'vitest';

let isNative = true;
const getUri = vi.fn<(opts: { path: string; directory: string }) => Promise<{ uri: string }>>();
const stat = vi.fn<(opts: { path: string; directory: string }) => Promise<{ mtime?: number }>>();
const mkdir =
  vi.fn<(opts: { path: string; directory: string; recursive: boolean }) => Promise<void>>();
const downloadFile = vi.fn<(opts: { url: string; path: string }) => Promise<void>>();
const convertFileSrc = vi.fn<(uri: string) => string>();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNative,
    convertFileSrc: (uri: string) => convertFileSrc(uri),
  },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    getUri: (opts: { path: string; directory: string }) => getUri(opts),
    stat: (opts: { path: string; directory: string }) => stat(opts),
    mkdir: (opts: { path: string; directory: string; recursive: boolean }) => mkdir(opts),
  },
  Directory: { Cache: 'CACHE' },
}));
vi.mock('@capacitor/file-transfer', () => ({
  FileTransfer: { downloadFile: (opts: { url: string; path: string }) => downloadFile(opts) },
}));

afterEach(() => {
  vi.clearAllMocks();
  isNative = true;
});

const URL = 'https://example.com/photo.jpg';

describe('resolveImage', () => {
  it('returns the URL unchanged on web, touching no Filesystem/FileTransfer API', async () => {
    isNative = false;
    const { resolveImage } = await import('../imageCache.js');
    const result = await resolveImage(URL);
    expect(result).toBe(URL);
    expect(getUri).not.toHaveBeenCalled();
  });

  it('serves a fresh (< 15 min old) cached copy without re-downloading', async () => {
    getUri.mockResolvedValue({ uri: 'file:///cache/abc' });
    stat.mockResolvedValue({ mtime: Date.now() - 5 * 60 * 1000 });
    convertFileSrc.mockReturnValue('capacitor://cache/abc');
    const { resolveImage } = await import('../imageCache.js');

    const result = await resolveImage(URL);

    expect(result).toBe('capacitor://cache/abc');
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('re-downloads once the cached copy is older than the 15-minute TTL', async () => {
    getUri.mockResolvedValue({ uri: 'file:///cache/abc' });
    stat.mockResolvedValue({ mtime: Date.now() - 16 * 60 * 1000 });
    mkdir.mockResolvedValue(undefined);
    downloadFile.mockResolvedValue(undefined);
    convertFileSrc.mockReturnValue('capacitor://cache/abc');
    const { resolveImage } = await import('../imageCache.js');

    const result = await resolveImage(URL);

    expect(downloadFile).toHaveBeenCalledWith({ url: URL, path: 'file:///cache/abc' });
    expect(result).toBe('capacitor://cache/abc');
  });

  it('downloads on a first-use cache miss (getUri/stat throwing)', async () => {
    getUri.mockRejectedValueOnce(new Error('not cached'));
    getUri.mockResolvedValueOnce({ uri: 'file:///cache/abc' });
    mkdir.mockResolvedValue(undefined);
    downloadFile.mockResolvedValue(undefined);
    convertFileSrc.mockReturnValue('capacitor://cache/abc');
    const { resolveImage } = await import('../imageCache.js');

    const result = await resolveImage(URL);

    expect(mkdir).toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledWith({ url: URL, path: 'file:///cache/abc' });
    expect(result).toBe('capacitor://cache/abc');
  });

  it('falls back to the remote URL, never a broken image, when the download itself fails', async () => {
    getUri.mockResolvedValue({ uri: 'file:///cache/abc' });
    stat.mockRejectedValue(new Error('not cached'));
    mkdir.mockResolvedValue(undefined);
    downloadFile.mockRejectedValue(new Error('network down'));
    const { resolveImage } = await import('../imageCache.js');

    const result = await resolveImage(URL);

    expect(result).toBe(URL);
  });

  it('treats an already-existing cache directory (mkdir rejecting) as a non-fatal case', async () => {
    getUri.mockResolvedValue({ uri: 'file:///cache/abc' });
    stat.mockRejectedValue(new Error('not cached'));
    mkdir.mockRejectedValue(new Error('EEXIST'));
    downloadFile.mockResolvedValue(undefined);
    convertFileSrc.mockReturnValue('capacitor://cache/abc');
    const { resolveImage } = await import('../imageCache.js');

    const result = await resolveImage(URL);

    expect(result).toBe('capacitor://cache/abc');
  });
});
