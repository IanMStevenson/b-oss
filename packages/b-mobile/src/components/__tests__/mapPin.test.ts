// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { createPinIcon } from '../mapPin.js';

describe('createPinIcon', () => {
  it("is an SVG pin in b-oss's brand green, anchored at its tip", () => {
    const icon = createPinIcon();
    expect(icon.options.html).toContain('fill="#1f4d3a"');
    expect(icon.options.iconSize).toEqual([27, 41]);
    expect(icon.options.iconAnchor).toEqual([13.5, 41]);
  });

  it('drops Leaflet’s default white box via its own class', () => {
    expect(createPinIcon().options.className).toBe('map-pin');
  });
});
