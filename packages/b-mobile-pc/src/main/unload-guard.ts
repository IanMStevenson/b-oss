// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// STUB (red tests first).
export const UNSAVED_DIALOG = { buttons: ['Discard', 'Keep editing'] } as const;

export function shouldDiscardOnUnload(_sessionEnding: boolean, _ask: () => number): boolean {
  return true;
}
