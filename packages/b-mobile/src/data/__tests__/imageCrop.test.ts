// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { cropToProportions, thumbnailCropToField } from '../imageCrop.js';

describe('cropToProportions', () => {
  it('rescales a percentage crop rect (0-100) to 0.0-1.0 proportions', () => {
    expect(cropToProportions({ x: 25, y: 50, width: 40, height: 40 })).toEqual({
      x: 0.25,
      y: 0.5,
      w: 0.4,
    });
  });

  it('rounds to 4 decimal places rather than carrying float noise', () => {
    expect(cropToProportions({ x: 33.333333, y: 0, width: 33.333333, height: 33.333333 })).toEqual({
      x: 0.3333,
      y: 0,
      w: 0.3333,
    });
  });

  it('only ever carries width, per thumbnail_crop being a square (§15)', () => {
    const result = cropToProportions({ x: 0, y: 0, width: 50, height: 999 });
    expect(result).not.toHaveProperty('height');
    expect(result.w).toBe(0.5);
  });
});

describe('thumbnailCropToField', () => {
  it('formats as the x,y,w string the API expects', () => {
    expect(thumbnailCropToField({ x: 0.25, y: 0.5, w: 0.4 })).toBe('0.25,0.5,0.4');
  });
});
