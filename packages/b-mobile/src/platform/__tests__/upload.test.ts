// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: {}, Directory: {} }));
vi.mock('@capacitor/file-transfer', () => ({ FileTransfer: {} }));

import { resolveFilePart } from '../upload.js';

describe('resolveFilePart (b-oss#318)', () => {
  it('reads a Blob source directly — the avatar is cropped to a Blob', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const part = await resolveFilePart({
      fieldName: 'avatar',
      filename: 'avatar.jpg',
      source: { blob },
    });
    expect(part).toMatchObject({
      fieldName: 'avatar',
      filename: 'avatar.jpg',
      contentType: 'image/jpeg',
    });
    expect([...part.bytes]).toEqual([1, 2, 3]);
  });

  it('falls back to image/jpeg for an untyped Blob', async () => {
    const part = await resolveFilePart({
      fieldName: 'avatar',
      filename: 'a.jpg',
      source: { blob: new Blob([new Uint8Array([9])]) },
    });
    expect(part.contentType).toBe('image/jpeg');
  });

  it('reads a path source through the filesystem', async () => {
    const readPath = vi.fn().mockResolvedValue('AQID'); // base64 of 1,2,3
    const part = await resolveFilePart(
      {
        fieldName: 'image',
        filename: 'image.jpg',
        source: { path: 'file:///x.jpg', mimeType: 'image/png' },
      },
      readPath,
    );
    expect(readPath).toHaveBeenCalledWith('file:///x.jpg');
    expect(part.contentType).toBe('image/png');
    expect([...part.bytes]).toEqual([1, 2, 3]);
  });
});
