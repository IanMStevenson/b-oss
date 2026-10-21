// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { buildMultipartBody } from '../multipartBody.js';

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe('buildMultipartBody', () => {
  it('writes one part per field, in insertion order', () => {
    const body = decode(
      buildMultipartBody({ date: '2026-01-01', title: 'Sunrise' }, undefined, 'B'),
    );
    expect(body).toBe(
      '--B\r\n' +
        'Content-Disposition: form-data; name="date"\r\n\r\n2026-01-01\r\n' +
        '--B\r\n' +
        'Content-Disposition: form-data; name="title"\r\n\r\nSunrise\r\n' +
        '--B--\r\n',
    );
  });

  it('appends the file part after the fields, with its own headers', () => {
    const fileBytes = new Uint8Array([0xff, 0xd8, 0xff]); // JPEG magic bytes
    const body = buildMultipartBody(
      { title: 'Sunrise' },
      { fieldName: 'image', filename: 'image.jpg', contentType: 'image/jpeg', bytes: fileBytes },
      'B',
    );
    const text = decode(body);
    expect(text).toContain('Content-Disposition: form-data; name="title"\r\n\r\nSunrise\r\n');
    expect(text).toContain(
      'Content-Disposition: form-data; name="image"; filename="image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n',
    );
    expect(text.trimEnd().endsWith('--B--')).toBe(true);

    // The raw file bytes must appear byte-for-byte, unmodified, inside the body.
    const fileStart = body.length - fileBytes.length - '\r\n--B--\r\n'.length;
    expect(Array.from(body.subarray(fileStart, fileStart + fileBytes.length))).toEqual(
      Array.from(fileBytes),
    );
  });

  it('produces just the closing boundary with no fields and no file', () => {
    expect(decode(buildMultipartBody({}, undefined, 'B'))).toBe('--B--\r\n');
  });

  it('omits undefined-valued fields the caller already filtered out (only string values reach it)', () => {
    // buildMultipartBody's own contract is Record<string, string> — callers (b-api's
    // mutateMultipart) are responsible for dropping undefined fields before calling it; this
    // just confirms every key present is written, nothing silently skipped.
    const text = decode(buildMultipartBody({ a: '1', b: '2' }, undefined, 'B'));
    expect(text).toContain('name="a"');
    expect(text).toContain('name="b"');
  });
});
