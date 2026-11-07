// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
  clampSelection,
  moveSelection,
  resizeSelection,
  selectionToArea,
  SELECTOR_CHROME_PX,
  stageWidthCss,
  widthLimits,
} from './squareSelection.js';

const ratio = 2; // landscape 2:1, so a square of w is 2w of the height
const limits = widthLimits(ratio, 2000, 300); // max 0.5, min 0.1515

describe('widthLimits', () => {
  it('caps at the shorter edge and floors at the minimum edge', () => {
    expect(limits.max).toBe(0.5);
    expect(limits.min).toBeCloseTo(0.1515, 4);
  });
});

describe('clampSelection', () => {
  it('pulls an overflowing selection back inside', () => {
    const s = clampSelection({ x: 0.9, y: 0.9, w: 0.3 }, ratio, limits);
    expect(s.x + s.w).toBeLessThanOrEqual(1);
    expect(s.y + s.w * ratio).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('moveSelection', () => {
  it('stops at the image edges', () => {
    const s = moveSelection({ x: 0.1, y: 0.1, w: 0.3 }, -1, -1, ratio, limits);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
    expect(s.w).toBe(0.3);
  });
});

describe('resizeSelection', () => {
  const sel = { x: 0.2, y: 0.1, w: 0.2 }; // height fraction 0.4
  it('keeps the opposite corner fixed when dragging se', () => {
    const s = resizeSelection(sel, 'se', 0.5, 0.3, ratio, limits);
    expect(s.x).toBe(0.2);
    expect(s.y).toBe(0.1);
    expect(s.w).toBeCloseTo(0.3, 6);
  });
  it('keeps se fixed when dragging nw', () => {
    const s = resizeSelection(sel, 'nw', 0.3, 0.2, ratio, limits);
    expect(s.x + s.w).toBeCloseTo(0.4, 6);
    expect(s.y + s.w * ratio).toBeCloseTo(0.5, 6);
  });
  it('never shrinks below the minimum', () => {
    const s = resizeSelection(sel, 'se', 0.2, 0.1, ratio, limits);
    expect(s.w).toBeCloseTo(limits.min, 6);
  });
  it('never grows past the image', () => {
    const s = resizeSelection(sel, 'se', 5, 5, ratio, limits);
    expect(s.x + s.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(s.y + s.w * ratio).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('selectionToArea', () => {
  it('reports percent with height scaled by the ratio', () => {
    expect(selectionToArea({ x: 0.1, y: 0.2, w: 0.25 }, ratio)).toEqual({
      x: 10,
      y: 20,
      width: 25,
      height: 50,
    });
  });
});

describe('stageWidthCss', () => {
  it('scales the width to 66% of what fits the container and the viewport height', () => {
    expect(stageWidthCss(1.5)).toBe(
      `min(66%, calc((100vh - ${SELECTOR_CHROME_PX}px) * 1.5 * 0.66))`,
    );
  });
  it('accepts a custom reserve', () => {
    expect(stageWidthCss(1, 100)).toBe('min(66%, calc((100vh - 100px) * 1 * 0.66))');
  });
});
