// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isNativePlatform, setStyle } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  setStyle: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
  SystemBars: { setStyle },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT' },
  SystemBarType: { StatusBar: 'StatusBar', NavigationBar: 'NavigationBar' },
}));

import { applySystemBarStyles } from '../systemBars.js';

beforeEach(() => vi.clearAllMocks());

describe('applySystemBarStyles', () => {
  it('does nothing in a browser', async () => {
    isNativePlatform.mockReturnValue(false);
    await applySystemBarStyles();
    expect(setStyle).not.toHaveBeenCalled();
  });

  it('gives the status bar light icons (green header) and the navigation bar dark icons (white strip)', async () => {
    isNativePlatform.mockReturnValue(true);
    await applySystemBarStyles();
    expect(setStyle).toHaveBeenCalledWith({ bar: 'StatusBar', style: 'DARK' });
    expect(setStyle).toHaveBeenCalledWith({ bar: 'NavigationBar', style: 'LIGHT' });
  });

  it('swallows a plugin failure', async () => {
    isNativePlatform.mockReturnValue(true);
    setStyle.mockRejectedValueOnce(new Error('nope'));
    await expect(applySystemBarStyles()).resolves.toBeUndefined();
  });
});
