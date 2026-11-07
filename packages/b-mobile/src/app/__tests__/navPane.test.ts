// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { isImmersiveRoute, navPaneOpen, nextNavPin, type NavPaneInput } from '../navPane.js';

const base: NavPaneInput = { split: 'auto', wide: true, immersive: false, pinned: 'auto' };

describe('isImmersiveRoute', () => {
  it('Browse, the Entry page and its full-screen photo are immersive', () => {
    for (const p of ['/browse', '/browse/', '/entry/123', '/entry/123/', '/entry/123/photo']) {
      expect(isImmersiveRoute(p), p).toBe(true);
    }
  });
  it('everything else is not, including forms under an entry', () => {
    for (const p of [
      '/accounts',
      '/settings',
      '/settings/app',
      '/map',
      '/search',
      '/entry/123/edit',
      '/entry/123/report',
      '/entry/123/edit/photo',
      '/compose',
      '/browsewhat',
    ]) {
      expect(isImmersiveRoute(p), p).toBe(false);
    }
  });
});

describe('navPaneOpen (route x pin x width)', () => {
  it('handheld (split off) is never beside the page, whatever the width or pin', () => {
    for (const wide of [true, false]) {
      for (const pinned of ['auto', true, false] as const) {
        for (const immersive of [true, false]) {
          expect(navPaneOpen({ split: 'off', wide, immersive, pinned })).toBe(false);
        }
      }
    }
  });

  it('a narrow window is always the drawer, even when pinned open', () => {
    expect(navPaneOpen({ ...base, wide: false })).toBe(false);
    expect(navPaneOpen({ ...base, wide: false, pinned: true })).toBe(false);
  });

  it('auto: open on ordinary screens, collapsed on immersive ones', () => {
    expect(navPaneOpen({ ...base, immersive: false })).toBe(true);
    expect(navPaneOpen({ ...base, immersive: true })).toBe(false);
  });

  it('a pin overrides the screen rule in both directions', () => {
    expect(navPaneOpen({ ...base, immersive: true, pinned: true })).toBe(true);
    expect(navPaneOpen({ ...base, immersive: false, pinned: false })).toBe(false);
  });
});

describe('nextNavPin', () => {
  it('collapsing an auto-open menu pins it closed', () => {
    expect(nextNavPin({ ...base, immersive: false, pinned: 'auto' })).toBe(false);
  });
  it('opening on an immersive screen pins it open', () => {
    expect(nextNavPin({ ...base, immersive: true, pinned: 'auto' })).toBe(true);
  });
  it('undoing a pin returns to auto, so it does not stick', () => {
    expect(nextNavPin({ ...base, immersive: false, pinned: false })).toBe('auto');
    expect(nextNavPin({ ...base, immersive: true, pinned: true })).toBe('auto');
  });
  it('a pin that fights the screen rule flips to the other pin', () => {
    expect(nextNavPin({ ...base, immersive: false, pinned: true })).toBe(false);
    expect(nextNavPin({ ...base, immersive: true, pinned: false })).toBe(true);
  });
});
