// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BrowserPlatformIO } from '../browser-platform-io.js';
import { createFakeDirHandle, createFakeDirHandleWithStats, FakeDir } from './helpers.js';

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

  it('appendFile adds to existing content without overwriting it', async () => {
    const io = new BrowserPlatformIO(createFakeDirHandle());
    await io.appendFile('_log.ndjson', 'line1\n');
    await io.appendFile('_log.ndjson', 'line2\n');
    const text = new TextDecoder().decode(await io.readFile('_log.ndjson'));
    expect(text).toBe('line1\nline2\n');
  });

  it('appendFile creates the file when it does not exist yet', async () => {
    const io = new BrowserPlatformIO(createFakeDirHandle());
    await io.appendFile('a/b/_log.ndjson', 'first\n');
    const text = new TextDecoder().decode(await io.readFile('a/b/_log.ndjson'));
    expect(text).toBe('first\n');
  });

  it('caches resolved directory handles — a second file under the same directory does not re-walk it', async () => {
    const { handle, stats } = createFakeDirHandleWithStats();
    const io = new BrowserPlatformIO(handle);
    await io.writeFile('gbradley/entries/2024/2024-01-01.json', 'a');
    const afterFirst = stats.getDirectoryHandleCalls;
    expect(afterFirst).toBeGreaterThan(0);

    await io.writeFile('gbradley/entries/2024/2024-01-02.json', 'b');
    // Same "gbradley/entries/2024" directory as before — every prefix is already cached,
    // so this should add zero further getDirectoryHandle() calls.
    expect(stats.getDirectoryHandleCalls).toBe(afterFirst);
  });

  it('self-heals when a cached directory handle goes stale, instead of failing the operation', async () => {
    const { handle, root } = createFakeDirHandleWithStats();
    const io = new BrowserPlatformIO(handle);
    await io.writeFile('gbradley/entries/2024/2024-01-01.json', 'a');

    // Simulate the "gbradley/entries" folder having been deleted and recreated outside our
    // control: the handle BrowserPlatformIO cached for it no longer works, but a fresh
    // getDirectoryHandle() call from the root would succeed against the (new) real folder —
    // modelled here by dropping the stale entry so a retry creates a working one.
    const gbradley = root.children.get('gbradley') as FakeDir;
    const staleEntries = gbradley.children.get('entries') as FakeDir;
    staleEntries.invalidated = true;
    gbradley.children.delete('entries');

    // A new file under a not-yet-cached sub-path forces a further getDirectoryHandle() call
    // on the (stale) cached "entries" handle, which should be caught and retried rather than
    // rejecting the whole write.
    await io.writeFile('gbradley/entries/2025/2025-01-01.json', 'b');
    expect(
      new TextDecoder().decode(await io.readFile('gbradley/entries/2025/2025-01-01.json')),
    ).toBe('b');
  });
});
