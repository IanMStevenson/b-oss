// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useRef, useCallback } from 'react';
import type { TouchEvent } from 'react';

// Minimum horizontal travel (px), and horizontal dominance over vertical, for a touch gesture to
// count as a swipe rather than an incidental scroll/tap/pan. Only fires on touch input — inert
// for mouse/keyboard hosts, so it's purely additive alongside existing click/keyboard navigation.
const SWIPE_THRESHOLD_PX = 48;

// A touch that starts in one of these is the user editing/selecting text or deliberately handling
// their own gesture, not paging — e.g. dragging a caret or a selection handle sideways in a comment
// box must not flip to another entry. `data-no-swipe` lets any host opt a region out.
const NO_SWIPE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-no-swipe]';

interface UseSwipeNavOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/** Attach the returned handlers to a container's onTouchStart/onTouchEnd for left/right swipe nav. */
export function useSwipeNav({ onSwipeLeft, onSwipeRight }: UseSwipeNavOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: TouchEvent) => {
    // A second touch means this is a pinch, not a swipe (usePinchZoom.ts handles that instead) —
    // ignoring it here keeps the two gestures from fighting over the same start/end coordinates.
    const t = e.touches.length === 1 ? e.touches[0] : null;
    const target = e.target as Element | null;
    const optedOut = typeof target?.closest === 'function' && target.closest(NO_SWIPE_SELECTOR);
    touchStart.current = t && !optedOut ? { x: t.clientX, y: t.clientY } : null;
  }, []);

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      const t = e.changedTouches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
      // Dragging across text to select it is a sideways touch too — don't also navigate away.
      if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
      if (dx < 0) onSwipeLeft?.();
      if (dx > 0) onSwipeRight?.();
    },
    [onSwipeLeft, onSwipeRight],
  );

  return { onTouchStart, onTouchEnd };
}
