// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — applyFontScale() is the mechanism app-architecture.md §20 flags as a real risk
// (the WebView doesn't apply Android's font-scale setting to CSS on its own), so it's exercised
// directly rather than only through a mocked consumer, same reasoning as platform/http.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';

const getFontScaleMock = vi.fn<() => Promise<{ fontScale: number }>>();
let isNative = true;

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative },
  registerPlugin: () => ({ getFontScale: () => getFontScaleMock() }),
}));

afterEach(() => {
  getFontScaleMock.mockReset();
  isNative = true;
  document.documentElement.style.fontSize = '';
});

describe('applyFontScale', () => {
  it('sets a root font-size multiplied by the OS font-scale on native', async () => {
    getFontScaleMock.mockResolvedValue({ fontScale: 2 });
    const { applyFontScale } = await import('../accessibility.js');

    await applyFontScale();

    expect(document.documentElement.style.fontSize).toBe('32px');
  });

  it('leaves the root font-size untouched on web', async () => {
    isNative = false;
    const { applyFontScale } = await import('../accessibility.js');

    await applyFontScale();

    expect(getFontScaleMock).not.toHaveBeenCalled();
    expect(document.documentElement.style.fontSize).toBe('');
  });
});
