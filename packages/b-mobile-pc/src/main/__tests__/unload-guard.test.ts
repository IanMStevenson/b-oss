// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi } from 'vitest';
import { decideQuit, shouldDiscardOnUnload, UNSAVED_DIALOG } from '../unload-guard.js';

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

describe('decideQuit (b-oss#1059)', () => {
  const clean = { dirty: false, sessionEnding: false, discardConfirmed: false };
  it('quits without asking when nothing is unsaved, Discard was already pressed, or the OS ends the session', () => {
    const ask = vi.fn(() => 1);
    expect(decideQuit(clean, ask)).toBe('quit');
    expect(decideQuit({ ...clean, dirty: true, discardConfirmed: true }, ask)).toBe('quit');
    expect(decideQuit({ ...clean, dirty: true, sessionEnding: true }, ask)).toBe('quit');
    expect(ask).not.toHaveBeenCalled();
  });
  it('asks when a draft is unsaved: Discard quits, Keep editing cancels', () => {
    expect(decideQuit({ ...clean, dirty: true }, () => 0)).toBe('quit');
    expect(decideQuit({ ...clean, dirty: true }, () => 1)).toBe('cancel');
  });
});
