// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';
import { EXIT_DIALOG, loginItemWanted, requestExit, shouldHideOnClose } from '../tray-policy.js';

describe('shouldHideOnClose', () => {
  it('hides only the user closing the window while notifications are on', () => {
    expect(shouldHideOnClose(true, false)).toBe(true);
    expect(shouldHideOnClose(false, false)).toBe(false);
  });

  it('never intercepts a quit under way (tray Exit, app.quit, updater, logoff, shutdown)', () => {
    expect(shouldHideOnClose(true, true)).toBe(false);
    expect(shouldHideOnClose(false, true)).toBe(false);
  });
});

describe('loginItemWanted', () => {
  it('follows whether any account is watched', () => {
    expect(loginItemWanted(0)).toBe(false);
    expect(loginItemWanted(1)).toBe(true);
    expect(loginItemWanted(3)).toBe(true);
  });
});

describe('requestExit', () => {
  it('quits at once, without asking, when notifications are off', async () => {
    const ask = vi.fn();
    const quit = vi.fn();
    expect(await requestExit(false, ask, quit)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('asks first when notifications are on, saying they will stop', async () => {
    const ask = vi.fn().mockResolvedValue({ response: 0 });
    const quit = vi.fn();
    expect(await requestExit(true, ask, quit)).toBe(true);
    expect(ask).toHaveBeenCalledWith(EXIT_DIALOG);
    expect(EXIT_DIALOG.detail).toMatch(/Notifications will stop/);
    expect(EXIT_DIALOG.buttons).toEqual(['Exit', 'Cancel']);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('Cancel (or closing the dialog) keeps running', async () => {
    for (const response of [1, -1]) {
      const quit = vi.fn();
      expect(await requestExit(true, vi.fn().mockResolvedValue({ response }), quit)).toBe(false);
      expect(quit).not.toHaveBeenCalled();
    }
  });
});
