// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — resolveImage()'s TTL arithmetic and fallback-on-error behaviour, explicitly
// named in §19's "this is where the density should be" list. Direct unit test (like
// platform/http.test.ts and platform/accessibility.test.ts) rather than only exercised through
// its consumers, since a cache miss silently becoming a broken image — or a *corrupt* one being
// cached and served for the whole TTL (b-oss#185) — is exactly the class of bug this module
// exists to prevent.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isNative = true;
const getUri = vi.fn<(opts: { path: string; directory: string }) => Promise<{ uri: string }>>();
const stat = vi.fn<(opts: { path: string; directory: string }) => Promise<{ mtime?: number }>>();
const mkdir =
  vi.fn<(opts: { path: string; directory: string; recursive: boolean }) => Promise<void>>();
const rename = vi.fn<(opts: { from: string; to: string; directory: string }) => Promise<void>>();
const deleteFile = vi.fn<(opts: { path: string; directory: string }) => Promise<void>>();
const downloadFile = vi.fn<(opts: { url: string; path: string }) => Promise<void>>();
const convertFileSrc = vi.fn<(uri: string) => string>();
const fetchMock = vi.fn<(src: string) => Promise<unknown>>();

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
    rename: (opts: { from: string; to: string; directory: string }) => rename(opts),
    deleteFile: (opts: { path: string; directory: string }) => deleteFile(opts),
  },
  Directory: { Cache: 'CACHE' },
}));
vi.mock('@capacitor/file-transfer', () => ({
  FileTransfer: { downloadFile: (opts: { url: string; path: string }) => downloadFile(opts) },
}));

const URL = 'https://example.com/photo.jpg';

// A complete JPEG (SOI … EOI) and one cut off mid-file, as a dropped connection would leave it.
const GOOD_JPEG = new Uint8Array([
  0xff,
  0xd8,
  ...Array.from({ length: 64 }, () => 0x11),
  0xff,
  0xd9,
]);
const TRUNCATED_JPEG = GOOD_JPEG.slice(0, 40);

/** What reading the downloaded file back returns, per call, in order. */
function readBack(...bodies: Uint8Array[]) {
  let i = 0;
  fetchMock.mockImplementation(() => {
    const body = bodies[Math.min(i++, bodies.length - 1)];
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
    });
  });
}

/** Wires the mocks as a cold cache: nothing cached, downloads succeed, read-backs are `bodies`. */
function coldCache(...bodies: Uint8Array[]) {
  getUri.mockImplementation(({ path }) => Promise.resolve({ uri: `file:///cache/${path}` }));
  stat.mockRejectedValue(new Error('not cached'));
  mkdir.mockResolvedValue(undefined);
  rename.mockResolvedValue(undefined);
  deleteFile.mockResolvedValue(undefined);
  downloadFile.mockResolvedValue(undefined);
  convertFileSrc.mockImplementation((uri) => `capacitor://${uri}`);
  readBack(...(bodies.length ? bodies : [GOOD_JPEG]));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  isNative = true;
});

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

    expect(await resolveImage(URL)).toBe('capacitor://cache/abc');
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('re-downloads once the cached copy is older than the 15-minute TTL', async () => {
    coldCache();
    stat.mockResolvedValue({ mtime: Date.now() - 16 * 60 * 1000 });
    const { resolveImage } = await import('../imageCache.js');

    const result = await resolveImage(URL);

    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(result).toMatch(/^capacitor:\/\/file:\/\/\/cache\/image-cache\/[0-9a-f]{32}$/);
  });

  it('downloads on a first-use cache miss', async () => {
    coldCache();
    const { resolveImage } = await import('../imageCache.js');

    const result = await resolveImage(URL);

    expect(mkdir).toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(result.startsWith('capacitor://')).toBe(true);
  });

  it('falls back to the remote URL, never a broken image, when the download itself fails', async () => {
    coldCache();
    downloadFile.mockRejectedValue(new Error('network down'));
    const { resolveImage } = await import('../imageCache.js');

    expect(await resolveImage(URL)).toBe(URL);
    expect(downloadFile).toHaveBeenCalledTimes(1); // a network failure isn't retried — that's what the fallback is for
  });

  it('treats an already-existing cache directory (mkdir rejecting) as a non-fatal case', async () => {
    coldCache();
    mkdir.mockRejectedValue(new Error('EEXIST'));
    const { resolveImage } = await import('../imageCache.js');

    expect((await resolveImage(URL)).startsWith('capacitor://')).toBe(true);
  });

  describe('never serves a partial file (b-oss#185)', () => {
    it('downloads to a temp file and only renames it into place once verified', async () => {
      coldCache();
      const { resolveImage } = await import('../imageCache.js');
      await resolveImage(URL);

      const downloadedTo = downloadFile.mock.calls[0][0].path;
      expect(downloadedTo).toMatch(/\.tmp$/); // never the final path
      expect(rename).toHaveBeenCalledTimes(1);
      const { from, to } = rename.mock.calls[0][0];
      expect(from).toBe(`${to}.tmp`);
      // The read-back (verification) happened between download and rename.
      expect(fetchMock.mock.invocationCallOrder[0]).toBeGreaterThan(
        downloadFile.mock.invocationCallOrder[0],
      );
      expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
        rename.mock.invocationCallOrder[0],
      );
    });

    it('rejects a truncated download, deletes it, and retries once', async () => {
      coldCache(TRUNCATED_JPEG, GOOD_JPEG); // first attempt arrives cut short, the retry is whole
      const { resolveImage } = await import('../imageCache.js');

      const result = await resolveImage(URL);

      expect(downloadFile).toHaveBeenCalledTimes(2);
      expect(rename).toHaveBeenCalledTimes(1); // only the good copy was ever moved into place
      expect(result.startsWith('capacitor://')).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('rejected download (attempt 1/2): jpeg truncated'),
        expect.anything(),
      );
      const deletedPaths = deleteFile.mock.calls.map((c) => c[0].path);
      expect(deletedPaths.some((path) => path.endsWith('.tmp'))).toBe(true); // the bad temp file went
    });

    it('caches nothing and serves from the network when it is bad twice', async () => {
      coldCache(TRUNCATED_JPEG);
      const { resolveImage } = await import('../imageCache.js');

      expect(await resolveImage(URL)).toBe(URL); // uncached, straight from the remote URL
      expect(downloadFile).toHaveBeenCalledTimes(2);
      expect(rename).not.toHaveBeenCalled(); // the corrupt file never became "the cached copy"
    });

    it('treats an HTML error page saved as the image as bad, not as an image', async () => {
      coldCache(new TextEncoder().encode('<html>403</html>'));
      const { resolveImage } = await import('../imageCache.js');

      expect(await resolveImage(URL)).toBe(URL);
      expect(rename).not.toHaveBeenCalled();
    });

    it('treats an unreadable download as bad too', async () => {
      coldCache();
      fetchMock.mockRejectedValue(new Error('read failed'));
      const { resolveImage } = await import('../imageCache.js');

      expect(await resolveImage(URL)).toBe(URL);
      expect(rename).not.toHaveBeenCalled();
    });
  });

  describe('concurrent requests for the same image (b-oss#185)', () => {
    it('share one download instead of racing to write the same file', async () => {
      coldCache();
      const { resolveImage } = await import('../imageCache.js');

      const [a, b, c] = await Promise.all([
        resolveImage(URL),
        resolveImage(URL),
        resolveImage(URL),
      ]);

      expect(downloadFile).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('different images still download independently', async () => {
      coldCache();
      const { resolveImage } = await import('../imageCache.js');

      await Promise.all([resolveImage(`${URL}?a`), resolveImage(`${URL}?b`)]);

      expect(downloadFile).toHaveBeenCalledTimes(2);
    });

    it('does not remember a finished request: a later call is a fresh lookup', async () => {
      coldCache();
      const { resolveImage } = await import('../imageCache.js');
      await resolveImage(URL);
      stat.mockResolvedValue({ mtime: Date.now() - 20 * 60 * 1000 }); // now expired
      await resolveImage(URL);
      expect(downloadFile).toHaveBeenCalledTimes(2);
    });

    it('a failed shared download resolves for every caller (to the URL), and a retry later works', async () => {
      coldCache();
      downloadFile.mockRejectedValueOnce(new Error('offline'));
      const { resolveImage } = await import('../imageCache.js');

      const results = await Promise.all([resolveImage(URL), resolveImage(URL)]);
      expect(results).toEqual([URL, URL]);

      const later = await resolveImage(URL);
      expect(later.startsWith('capacitor://')).toBe(true);
    });
  });
});

describe('invalidateImage', () => {
  it('drops the cached copy (and any temp file) so the next resolve fetches afresh', async () => {
    coldCache();
    const { invalidateImage } = await import('../imageCache.js');

    await invalidateImage(URL);

    const deleted = deleteFile.mock.calls.map((c) => c[0].path);
    expect(deleted).toHaveLength(2);
    expect(deleted[1]).toBe(`${deleted[0]}.tmp`);
  });

  it('is a no-op on web', async () => {
    isNative = false;
    const { invalidateImage } = await import('../imageCache.js');
    await invalidateImage(URL);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('does not throw if there was nothing to delete', async () => {
    coldCache();
    deleteFile.mockRejectedValue(new Error('ENOENT'));
    const { invalidateImage } = await import('../imageCache.js');
    await expect(invalidateImage(URL)).resolves.toBeUndefined();
  });
});
