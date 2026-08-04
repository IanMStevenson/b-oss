// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { validatePickedPhoto, MIN_DIMENSION } from '../photoValidation.js';

describe('validatePickedPhoto', () => {
  it('accepts a JPEG at or above the minimum dimension', () => {
    expect(
      validatePickedPhoto({ mimeType: 'image/jpeg', width: MIN_DIMENSION, height: MIN_DIMENSION }),
    ).toEqual({ ok: true });
  });

  it('accepts a PNG too', () => {
    expect(validatePickedPhoto({ mimeType: 'image/png', width: 500, height: 500 })).toEqual({
      ok: true,
    });
  });

  it('rejects an unsupported type', () => {
    const result = validatePickedPhoto({ mimeType: 'image/gif', width: 500, height: 500 });
    expect(result.ok).toBe(false);
  });

  it('rejects a photo narrower than the minimum', () => {
    const result = validatePickedPhoto({
      mimeType: 'image/jpeg',
      width: MIN_DIMENSION - 1,
      height: 500,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a photo shorter than the minimum', () => {
    const result = validatePickedPhoto({
      mimeType: 'image/jpeg',
      width: 500,
      height: MIN_DIMENSION - 1,
    });
    expect(result.ok).toBe(false);
  });

  it('does not fail dimension checks when dimensions are unknown (null)', () => {
    expect(validatePickedPhoto({ mimeType: 'image/jpeg', width: null, height: null })).toEqual({
      ok: true,
    });
  });
});
