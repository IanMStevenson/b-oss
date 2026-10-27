// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';

const { Marker } = vi.hoisted(() => ({
  Marker: vi.fn(function (this: { options: unknown }, options: unknown) {
    this.options = options;
  }),
}));
vi.mock('maplibre-gl', () => ({ Marker }));

import { createPin } from '../mapPin.js';

afterEach(() => {
  document.documentElement.style.removeProperty('--accent');
  vi.clearAllMocks();
});

describe('createPin', () => {
  it('falls back to the brand green when no theme token is defined', () => {
    createPin();
    expect(Marker).toHaveBeenCalledWith({ color: '#1f4d3a', draggable: false });
  });

  it("takes the theme's accent, so the pin stays visible on a dark map", () => {
    document.documentElement.style.setProperty('--accent', ' #8fd3af ');
    createPin({ draggable: true });
    expect(Marker).toHaveBeenCalledWith({ color: '#8fd3af', draggable: true });
  });
});
