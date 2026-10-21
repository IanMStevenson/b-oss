// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { checkImageIntegrity } from '../imageIntegrity.js';

const bytes = (...b: number[]) => new Uint8Array(b);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const filler = (n: number) => new Uint8Array(n).fill(0x11);

describe('checkImageIntegrity', () => {
  describe('JPEG', () => {
    const jpeg = concat(bytes(0xff, 0xd8), filler(100), bytes(0xff, 0xd9));

    it('accepts a file that ends with the end-of-image marker', () => {
      expect(checkImageIntegrity(jpeg)).toEqual({ ok: true, format: 'jpeg' });
    });

    it('accepts trailing zero padding after the marker', () => {
      expect(checkImageIntegrity(concat(jpeg, new Uint8Array(5)))).toEqual({
        ok: true,
        format: 'jpeg',
      });
    });

    it('rejects a truncated file — the "green jaggies" case', () => {
      const truncated = jpeg.slice(0, 60);
      const result = checkImageIntegrity(truncated);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toMatch(/truncated/);
    });

    it('rejects a file cut off right after the start marker', () => {
      expect(checkImageIntegrity(bytes(0xff, 0xd8)).ok).toBe(false);
    });

    it('is not fooled by an end-of-image marker earlier in the file (e.g. an EXIF thumbnail)', () => {
      const embeddedThumb = concat(bytes(0xff, 0xd8), filler(20), bytes(0xff, 0xd9), filler(500));
      expect(checkImageIntegrity(embeddedThumb).ok).toBe(false);
    });
  });

  describe('PNG', () => {
    const sig = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    const iend = bytes(0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82);
    it('accepts a PNG ending in IEND, rejects one without', () => {
      expect(checkImageIntegrity(concat(sig, filler(50), iend))).toEqual({
        ok: true,
        format: 'png',
      });
      expect(checkImageIntegrity(concat(sig, filler(50))).ok).toBe(false);
    });
  });

  describe('GIF', () => {
    it('needs the 0x3B trailer', () => {
      const head = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
      expect(checkImageIntegrity(concat(head, filler(20), bytes(0x3b)))).toEqual({
        ok: true,
        format: 'gif',
      });
      expect(checkImageIntegrity(concat(head, filler(20))).ok).toBe(false);
    });
  });

  describe('WebP', () => {
    const riff = (declared: number, total: number) => {
      const out = new Uint8Array(total).fill(0x22);
      out.set([0x52, 0x49, 0x46, 0x46], 0);
      out.set([declared & 0xff, (declared >> 8) & 0xff, (declared >> 16) & 0xff, 0], 4);
      out.set([0x57, 0x45, 0x42, 0x50], 8);
      return out;
    };
    it('accepts when the whole declared size is present, rejects when short', () => {
      expect(checkImageIntegrity(riff(92, 100))).toEqual({ ok: true, format: 'webp' });
      expect(checkImageIntegrity(riff(92, 60)).ok).toBe(false);
    });
  });

  it('rejects an empty file', () => {
    expect(checkImageIntegrity(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty file' });
  });

  it('rejects something that is not an image at all — e.g. an HTML error page', () => {
    const html = new TextEncoder().encode('<html><body>403 Forbidden</body></html>');
    expect(checkImageIntegrity(html).ok).toBe(false);
  });
});
