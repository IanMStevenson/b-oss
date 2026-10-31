// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi } from 'vitest';
import {
  canSelectThumbnail,
  cropToProportions,
  defaultThumbnailCrop,
  thumbnailCropToArea,
  maxZoomForMinEdge,
  encodeUnderLimit,
  fitWithin,
  thumbnailCropToField,
} from '../imageCrop.js';

describe('cropToProportions', () => {
  it('rescales a percentage crop rect (0-100) to 0.0-1.0 proportions', () => {
    expect(cropToProportions({ x: 25, y: 50, width: 40, height: 40 })).toEqual({
      x: 0.25,
      y: 0.5,
      w: 0.4,
    });
  });

  it('floors to 4 decimal places rather than rounding up past the API fit limits', () => {
    expect(cropToProportions({ x: 33.333333, y: 0, width: 33.333333, height: 33.333333 })).toEqual({
      x: 0.3333,
      y: 0,
      w: 0.3333,
    });
  });

  it('keeps a full-height crop on a 3:2 landscape photo within y + w*width/height <= 1', () => {
    const { x, y, w } = cropToProportions({ x: 16.6667, y: 0, width: 66.6667, height: 100 });
    expect(x + w).toBeLessThanOrEqual(1);
    expect(y + (w * 3) / 2).toBeLessThanOrEqual(1);
  });

  it('keeps a full-width crop on a portrait photo within x + w <= 1', () => {
    const { x, w } = cropToProportions({ x: 0, y: 10, width: 100, height: 66.6667 });
    expect(x + w).toBeLessThanOrEqual(1);
  });

  it('only ever carries width, per thumbnail_crop being a square (§15)', () => {
    const result = cropToProportions({ x: 0, y: 0, width: 50, height: 50 });
    expect(result).not.toHaveProperty('height');
    expect(result.w).toBe(0.5);
  });
});

describe('thumbnailCropToField', () => {
  it('formats as the x,y,w string the API expects', () => {
    expect(thumbnailCropToField({ x: 0.25, y: 0.5, w: 0.4 })).toBe('0.25,0.5,0.4');
  });
});

describe('fitWithin', () => {
  it('scales the longest edge down to the limit, keeping the aspect', () => {
    expect(fitWithin(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
    expect(fitWithin(1500, 3000, 1024)).toEqual({ width: 512, height: 1024 });
  });
  it('never scales up', () => {
    expect(fitWithin(400, 400, 1024)).toEqual({ width: 400, height: 400 });
  });
});

describe('encodeUnderLimit', () => {
  const blobOf = (n: number) => new Blob([new Uint8Array(n)]);

  it('returns the first attempt that fits', async () => {
    const encode = vi.fn().mockResolvedValue(blobOf(100));
    const out = await encodeUnderLimit(encode, 1000, 1024);
    expect(out.size).toBe(100);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith(1024, 0.9);
  });

  it('lowers quality, then size, until it fits', async () => {
    const encode = vi.fn((edge: number, q: number) =>
      Promise.resolve(blobOf(edge === 1024 ? 5000 : 500 + q)),
    );
    const out = await encodeUnderLimit(encode, 1000, 1024);
    expect(out.size).toBeLessThanOrEqual(1000);
    expect(encode.mock.calls.some(([edge]) => edge === 512)).toBe(true);
    expect(encode.mock.calls.slice(0, 4).map(([, q]) => q)).toEqual([0.9, 0.8, 0.7, 0.55]);
  });

  it('gives back the last attempt when nothing fits, leaving the server to say why', async () => {
    const out = await encodeUnderLimit(() => Promise.resolve(blobOf(9999)), 1000, 1024);
    expect(out.size).toBe(9999);
  });
});

describe('thumbnail minimum size', () => {
  it('caps zoom so the crop side stays above the minimum', () => {
    const zoom = maxZoomForMinEdge(4000, 3000, 300);
    expect(3000 / zoom).toBeGreaterThanOrEqual(300);
  });

  it('never goes below 1, even for a photo that is too small', () => {
    expect(maxZoomForMinEdge(400, 250, 300)).toBe(1);
  });

  it('offers selection only when the shorter edge can hold the minimum', () => {
    expect(canSelectThumbnail(4000, 3000)).toBe(true);
    expect(canSelectThumbnail(2000, 250)).toBe(false);
    expect(canSelectThumbnail(null, null)).toBe(true);
  });
});

describe('defaultThumbnailCrop', () => {
  it('is a centred square covering 88% of the shorter edge, landscape', () => {
    const c = defaultThumbnailCrop(4 / 3);
    expect(c.w).toBeCloseTo(0.66, 4);
    expect(c.x).toBeCloseTo(0.17, 4);
    expect(c.y).toBeCloseTo(0.06, 4);
  });

  it('is a centred square covering 88% of the shorter edge, portrait', () => {
    const c = defaultThumbnailCrop(3 / 4);
    expect(c.w).toBe(0.88);
    expect(c.x).toBeCloseTo(0.06, 4);
    expect(c.y).toBeCloseTo(0.17, 4);
  });

  it('converts a crop to the percentage rect the cropper starts from', () => {
    expect(thumbnailCropToArea({ x: 0.1, y: 0.2, w: 0.5 }, 2)).toEqual({
      x: 10,
      y: 20,
      width: 50,
      height: 100,
    });
  });
});
