// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// STUB (red tests first): the real rules arrive with the fix.
import type { ComposeDraft } from './composeDraftStore.js';

export function navigationLeavesDraft(_draft: ComposeDraft | null, _to: string): boolean {
  return false;
}

export function backLeavesDraft(_draft: ComposeDraft | null, _fromPath: string): boolean {
  return false;
}
