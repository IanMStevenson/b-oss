// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { validatePickedPhoto } from '../photoValidation.js';

describe('validatePickedPhoto', () => {
  it('rejects an unsupported type regardless of purpose', () => {
    expect(validatePickedPhoto({ mimeType: 'image/gif', width: 900, height: 900 }).ok).toBe(false);
  });

  it('accepts a JPEG or PNG at or above the minimum edge for entries (600px)', () => {
    expect(validatePickedPhoto({ mimeType: 'image/jpeg', width: 600, height: 600 })).toEqual({
      ok: true,
    });
    expect(validatePickedPhoto({ mimeType: 'image/png', width: 600, height: 600 })).toEqual({
      ok: true,
    });
  });

  it('accepts an entry photo as long as at least one edge clears 600px, not both', () => {
    // A thin panorama: width clears the floor, height doesn't — still valid per Blipfoto's own
    // "at least one edge" rule, not the stricter both-edges check this used to enforce.
    expect(validatePickedPhoto({ mimeType: 'image/jpeg', width: 1800, height: 300 })).toEqual({
      ok: true,
    });
  });

  it('rejects an entry photo where neither edge reaches 600px', () => {
    const result = validatePickedPhoto({ mimeType: 'image/jpeg', width: 500, height: 500 });
    expect(result).toEqual({ ok: false, message: 'That photo is too small to use.' });
  });

  it('has no maximum dimension — an oversized entry photo is accepted', () => {
    expect(validatePickedPhoto({ mimeType: 'image/jpeg', width: 8000, height: 6000 })).toEqual({
      ok: true,
    });
  });

  it('rejects an entry photo whose file exceeds 20MB', () => {
    const result = validatePickedPhoto({
      mimeType: 'image/jpeg',
      width: 1200,
      height: 1200,
      sizeBytes: 21 * 1024 * 1024,
    });
    expect(result).toEqual({ ok: false, message: 'That photo’s file is too large to upload.' });
  });

  it('rejects an entry photo whose file is under 1KB', () => {
    const result = validatePickedPhoto({
      mimeType: 'image/jpeg',
      width: 1200,
      height: 1200,
      sizeBytes: 512,
    });
    expect(result.ok).toBe(false);
  });

  it('does not fail width/height/size checks when unknown (null/undefined)', () => {
    expect(validatePickedPhoto({ mimeType: 'image/jpeg', width: null, height: null })).toEqual({
      ok: true,
    });
    expect(
      validatePickedPhoto({
        mimeType: 'image/jpeg',
        width: 1200,
        height: 1200,
        sizeBytes: null,
      }),
    ).toEqual({ ok: true });
  });

  it('defaults to the entry purpose when none is given', () => {
    expect(validatePickedPhoto({ mimeType: 'image/jpeg', width: 500, height: 500 }).ok).toBe(false);
  });

  describe('avatar purpose', () => {
    it('accepts a photo at or above the smaller 300px avatar minimum', () => {
      expect(
        validatePickedPhoto({ mimeType: 'image/jpeg', width: 300, height: 300 }, 'avatar'),
      ).toEqual({ ok: true });
    });

    it('rejects an avatar photo below the 300px minimum, even though it would clear the entry floor', () => {
      const result = validatePickedPhoto(
        { mimeType: 'image/jpeg', width: 299, height: 299 },
        'avatar',
      );
      expect(result.ok).toBe(false);
    });

    it('rejects an avatar file over the smaller 3MB cap, even though it would fit the entry cap', () => {
      const result = validatePickedPhoto(
        { mimeType: 'image/jpeg', width: 600, height: 600, sizeBytes: 4 * 1024 * 1024 },
        'avatar',
      );
      expect(result).toEqual({ ok: false, message: 'That photo’s file is too large to upload.' });
    });

    it('has no minimum file size for avatars — nothing below 1KB is documented for this path', () => {
      expect(
        validatePickedPhoto(
          { mimeType: 'image/jpeg', width: 600, height: 600, sizeBytes: 200 },
          'avatar',
        ),
      ).toEqual({ ok: true });
    });
  });
});
