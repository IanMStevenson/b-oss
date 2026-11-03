// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one definition of "is the primary pointer precise?" (a mouse or trackpad, not touch). The
// root `data-pointer` attribute (pointerDensity.ts), the header refresh button (PointerRefresh)
// and the thumbnail selector (ThumbnailPhotoFrame) all read it, so they cannot disagree.

export const FINE_POINTER_QUERY = '(pointer: fine)';

/** True when the primary pointer is precise right now. False without matchMedia. */
export function isFinePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(FINE_POINTER_QUERY).matches;
}
