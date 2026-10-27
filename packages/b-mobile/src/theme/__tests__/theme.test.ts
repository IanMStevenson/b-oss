// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../platform/blipfotoLinks.js', () => ({
  setBlipfotoLinksEnabled: vi.fn().mockResolvedValue(undefined),
}));
const { applySystemBarStyles } = vi.hoisted(() => ({
  applySystemBarStyles: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../platform/systemBars.js', () => ({ applySystemBarStyles }));

import indexHtml from '../../../index.html?raw';
import { isDarkTheme, resolveTheme, applyTheme, initTheme, THEME_STORAGE_KEY } from '../theme.js';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';

describe('resolveTheme', () => {
  it('System default follows the phone and only ever picks light or dark', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('an explicit choice wins over the phone', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('mid', false)).toBe('mid');
    expect(resolveTheme('mid', true)).toBe('mid');
  });

  it('treats mid as a dark theme', () => {
    expect(isDarkTheme('light')).toBe(false);
    expect(isDarkTheme('dark')).toBe(true);
    expect(isDarkTheme('mid')).toBe(true);
  });
});

describe('applyTheme / initTheme', () => {
  let systemDark = false;
  let onChange: ((e: { matches: boolean }) => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    applySystemBarStyles.mockClear();
    useDevicePrefsStore.setState({ theme: 'system' });
    systemDark = false;
    onChange = null;
    window.matchMedia = vi.fn().mockImplementation(() => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        onChange = cb;
      },
    }));
  });

  it('writes the theme to <html> and tells the system bars whether it is dark', () => {
    applyTheme('mid');
    expect(document.documentElement.dataset.theme).toBe('mid');
    expect(applySystemBarStyles).toHaveBeenLastCalledWith(true);
    applyTheme('light');
    expect(applySystemBarStyles).toHaveBeenLastCalledWith(false);
  });

  it('applies the mirrored choice synchronously at startup', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'mid');
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('mid');
  });

  it('falls back to the system theme when nothing valid is stored', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    systemDark = true;
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows the Theme setting and mirrors it for the next launch', () => {
    initTheme();
    useDevicePrefsStore.getState().setTheme('mid');
    expect(document.documentElement.dataset.theme).toBe('mid');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('mid');
  });

  it('follows the phone live only while the setting is System default', () => {
    initTheme();
    onChange?.({ matches: true });
    expect(document.documentElement.dataset.theme).toBe('dark');
    useDevicePrefsStore.getState().setTheme('mid');
    onChange?.({ matches: false });
    expect(document.documentElement.dataset.theme).toBe('mid');
  });
});

describe('pre-paint values in index.html', () => {
  // The values must match b-visual's themes.css (--bg under dark; --mid-base for mid), or the
  // launch flash returns as a colour jump.
  it('paints the dark and mid page colours before the app loads', () => {
    expect(indexHtml).toContain('background: #121212');
    expect(indexHtml).toContain('background: #4c4c4c');
    expect(indexHtml).toContain("localStorage.getItem('b-mobile:theme')");
  });
});
