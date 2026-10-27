// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isNativePlatform, setTheme } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  setTheme: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
  registerPlugin: () => ({ setTheme }),
}));

import { setNativeTheme } from '../nativeTheme.js';

beforeEach(() => vi.clearAllMocks());

describe('setNativeTheme', () => {
  it('does nothing in a browser', async () => {
    isNativePlatform.mockReturnValue(false);
    await setNativeTheme('mid');
    expect(setTheme).not.toHaveBeenCalled();
  });

  it('passes the preference (not the resolved theme) to the native side', async () => {
    isNativePlatform.mockReturnValue(true);
    await setNativeTheme('system');
    expect(setTheme).toHaveBeenCalledWith({ preference: 'system' });
  });

  it('swallows a plugin failure', async () => {
    isNativePlatform.mockReturnValue(true);
    setTheme.mockRejectedValueOnce(new Error('nope'));
    await expect(setNativeTheme('dark')).resolves.toBeUndefined();
  });
});
