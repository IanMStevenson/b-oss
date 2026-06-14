// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BrowserPlatformIO } from '../browser-platform-io.js';
import { createFakeDirHandle } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrowserPlatformIO', () => {
  it('writes and reads a file through nested path segments', async () => {
    const io = new BrowserPlatformIO(createFakeDirHandle());
    await io.writeFile('gbradley/entries/2024/2024-01-01.json', '{"a":1}');
    const bytes = await io.readFile('gbradley/entries/2024/2024-01-01.json');
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1}');
  });

  it('reports fileExists correctly and lists a directory', async () => {
    const io = new BrowserPlatformIO(createFakeDirHandle());
    await io.writeFile('gbradley/journal.json', '{}');
    expect(await io.fileExists('gbradley/journal.json')).toBe(true);
    expect(await io.fileExists('gbradley/missing.json')).toBe(false);
    expect(await io.listDir('gbradley')).toContain('journal.json');
  });

  it('deletes a file', async () => {
    const io = new BrowserPlatformIO(createFakeDirHandle());
    await io.writeFile('a/b.txt', 'x');
    await io.deleteFile('a/b.txt');
    expect(await io.fileExists('a/b.txt')).toBe(false);
  });

  it('downloadFile writes the fetched bytes on a 200', async () => {
    const io = new BrowserPlatformIO(createFakeDirHandle());
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode('IMG').buffer),
        }),
      ),
    );
    await io.downloadFile('https://x/img.jpg', 'gbradley/2024-01-01.jpg');
    expect(new TextDecoder().decode(await io.readFile('gbradley/2024-01-01.jpg'))).toBe('IMG');
  });

  it('downloadFile throws on a non-OK response instead of writing the error body', async () => {
    const io = new BrowserPlatformIO(createFakeDirHandle());
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          arrayBuffer: () => Promise.resolve(new Uint8Array().buffer),
        }),
      ),
    );
    await expect(io.downloadFile('https://x/img.jpg', 'gbradley/2024-01-01.jpg')).rejects.toThrow(
      /429/,
    );
    expect(await io.fileExists('gbradley/2024-01-01.jpg')).toBe(false);
  });
});
