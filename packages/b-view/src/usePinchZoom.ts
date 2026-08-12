// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useRef, useCallback } from 'react';
import type { TouchEvent } from 'react';

interface TouchPoint {
  clientX: number;
  clientY: number;
}

function distance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

interface UsePinchZoomOptions {
  sizePercent: number;
  onSizeChange?: (newPercent: number) => void;
  min?: number;
  max?: number;
}

/** Two-finger pinch, scaled off ThumbnailGrid's own zoom control — same clamp range as its
 * ZoomIn/ZoomOut buttons by default. Attach alongside useSwipeNav's handlers on the same element;
 * each only acts on its own touch count (useSwipeNav ignores anything but a single touch, this
 * only acts on exactly two), so the two coexist without a shared gesture-recognizer. Inert
 * (touches.length is never 2) on any host with no real multi-touch input, so it's safe to wire up
 * unconditionally alongside onSizeChange rather than needing its own opt-in prop. */
export function usePinchZoom({
  sizePercent,
  onSizeChange,
  min = 30,
  max = 200,
}: UsePinchZoomOptions) {
  const gesture = useRef<{ startDistance: number; startPercent: number } | null>(null);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!onSizeChange || e.touches.length !== 2) {
        gesture.current = null;
        return;
      }
      gesture.current = {
        startDistance: distance(e.touches[0], e.touches[1]),
        startPercent: sizePercent,
      };
    },
    [onSizeChange, sizePercent],
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      const g = gesture.current;
      if (!g || !onSizeChange || e.touches.length !== 2 || g.startDistance === 0) return;
      const ratio = distance(e.touches[0], e.touches[1]) / g.startDistance;
      const next = Math.round(g.startPercent * ratio);
      onSizeChange(Math.max(min, Math.min(max, next)));
    },
    [onSizeChange, min, max],
  );

  const onTouchEnd = useCallback((e: TouchEvent) => {
    if (e.touches.length < 2) gesture.current = null;
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
