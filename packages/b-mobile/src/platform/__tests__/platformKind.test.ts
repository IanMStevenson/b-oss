// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

const { isNativePlatform, getPlatform } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform, getPlatform } }));

import { isCapacitorNative, platformKind } from '../platformKind.js';

beforeEach(() => {
  isNativePlatform.mockReset();
  getPlatform.mockReset();
});

describe('isCapacitorNative', () => {
  it('is exactly Capacitor.isNativePlatform()', () => {
    isNativePlatform.mockReturnValue(true);
    expect(isCapacitorNative()).toBe(true);
    isNativePlatform.mockReturnValue(false);
    expect(isCapacitorNative()).toBe(false);
  });
});

describe('platformKind: desktop shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is desktop when the shell bridge is present, whatever Capacitor says', () => {
    vi.stubGlobal('window', { bMobileDesktop: { version: 1 } });
    isNativePlatform.mockReturnValue(false);
    expect(platformKind()).toBe('desktop');
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('android');
    expect(platformKind()).toBe('desktop');
  });

  it('does not count as capacitor-native, so the plugins fall back to their web code', () => {
    vi.stubGlobal('window', { bMobileDesktop: { version: 1 } });
    isNativePlatform.mockReturnValue(false);
    expect(isCapacitorNative()).toBe(false);
  });

  it('ignores a bridge with an unknown version or shape', () => {
    isNativePlatform.mockReturnValue(false);
    for (const bridge of [{ version: 2 }, {}, null, 'yes', undefined]) {
      vi.stubGlobal('window', { bMobileDesktop: bridge });
      expect(platformKind()).toBe('web');
    }
  });

  it('is fine with no window at all (node tests, workers)', () => {
    vi.stubGlobal('window', undefined);
    isNativePlatform.mockReturnValue(false);
    expect(platformKind()).toBe('web');
  });
});

describe('platformKind', () => {
  it('is web when Capacitor is not native, without asking which platform', () => {
    isNativePlatform.mockReturnValue(false);
    expect(platformKind()).toBe('web');
    expect(getPlatform).not.toHaveBeenCalled();
  });

  it('is android for a native Android shell', () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('android');
    expect(platformKind()).toBe('android');
  });

  it('is ios for a native iOS shell', () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue('ios');
    expect(platformKind()).toBe('ios');
  });

  it('treats any other native platform name as android (only an Android project exists today)', () => {
    isNativePlatform.mockReturnValue(true);
    getPlatform.mockReturnValue(undefined);
    expect(platformKind()).toBe('android');
  });
});
