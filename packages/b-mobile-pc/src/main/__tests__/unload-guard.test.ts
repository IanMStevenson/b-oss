// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi } from 'vitest';
import { shouldDiscardOnUnload, UNSAVED_DIALOG } from '../unload-guard.js';

describe('unload guard (b-oss#1059)', () => {
  it('Discard (button 0) lets the reload or quit go ahead', () => {
    expect(shouldDiscardOnUnload(false, () => 0)).toBe(true);
  });

  it('Keep editing (button 1) or a dismissed dialog stops it', () => {
    expect(shouldDiscardOnUnload(false, () => 1)).toBe(false);
    expect(shouldDiscardOnUnload(false, () => -1)).toBe(false);
  });

  it('never asks while the OS is ending the session: a shutdown must not be held up', () => {
    const ask = vi.fn(() => 1);
    expect(shouldDiscardOnUnload(true, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('the dialog defaults to the safe button and Escape means Keep editing', () => {
    expect(UNSAVED_DIALOG.buttons).toEqual(['Discard', 'Keep editing']);
    expect(UNSAVED_DIALOG.defaultId).toBe(1);
    expect(UNSAVED_DIALOG.cancelId).toBe(1);
  });
});
