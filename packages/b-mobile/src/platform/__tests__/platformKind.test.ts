// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
