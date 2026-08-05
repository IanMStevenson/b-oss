// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useRef, useCallback } from 'react';
import type { TouchEvent } from 'react';

// Minimum horizontal travel (px), and horizontal dominance over vertical, for a touch gesture to
// count as a swipe rather than an incidental scroll/tap/pan. Only fires on touch input — inert
// for mouse/keyboard hosts, so it's purely additive alongside existing click/keyboard navigation.
const SWIPE_THRESHOLD_PX = 48;

interface UseSwipeNavOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/** Attach the returned handlers to a container's onTouchStart/onTouchEnd for left/right swipe nav. */
export function useSwipeNav({ onSwipeLeft, onSwipeRight }: UseSwipeNavOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
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
      if (dx < 0) onSwipeLeft?.();
      if (dx > 0) onSwipeRight?.();
    },
    [onSwipeLeft, onSwipeRight],
  );

  return { onTouchStart, onTouchEnd };
}
