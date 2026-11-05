// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { DEFAULT_BOUNDS, MIN_HEIGHT, MIN_WIDTH, parseWindowState } from '../window-state.js';

const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe('parseWindowState', () => {
  it('uses the defaults with no saved state or garbage', () => {
    expect(parseWindowState(null, [display])).toEqual(DEFAULT_BOUNDS);
    expect(parseWindowState('not json', [display])).toEqual(DEFAULT_BOUNDS);
    expect(parseWindowState('{"width":"wide"}', [display])).toEqual(DEFAULT_BOUNDS);
  });

  it('restores size, position and maximised state', () => {
    expect(
      parseWindowState('{"x":100,"y":50,"width":800,"height":700,"maximized":true}', [display]),
    ).toEqual({
      x: 100,
      y: 50,
      width: 800,
      height: 700,
      maximized: true,
    });
  });

  it('enforces the minimum size', () => {
    const b = parseWindowState('{"width":10,"height":10}', [display]);
    expect([b.width, b.height]).toEqual([MIN_WIDTH, MIN_HEIGHT]);
  });

  it('drops a position that is no longer on any display', () => {
    const b = parseWindowState('{"x":4000,"y":100,"width":800,"height":700}', [display]);
    expect(b.x).toBeUndefined();
    expect(b.width).toBe(800);
  });

  it('keeps a position on a second display', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1080 };
    expect(
      parseWindowState('{"x":2500,"y":100,"width":800,"height":700}', [display, second]).x,
    ).toBe(2500);
  });
});
