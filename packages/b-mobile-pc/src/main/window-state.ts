// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Remembers the window's size and position between runs. Pure parsing/validation here; index.ts
// does the reading, writing and listening.

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

export const DEFAULT_BOUNDS: WindowBounds = { width: 480, height: 900, maximized: false };
export const MIN_WIDTH = 360;
export const MIN_HEIGHT = 480;

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Returns saved bounds if they look sane, otherwise the defaults. A position is only kept if it
 * is on one of the given display areas, so a window saved on a monitor that is gone is not lost. */
export function parseWindowState(
  raw: string | null,
  displays: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
): WindowBounds {
  if (raw === null) return DEFAULT_BOUNDS;
  let parsed: Partial<WindowBounds>;
  try {
    parsed = JSON.parse(raw) as Partial<WindowBounds>;
  } catch {
    return DEFAULT_BOUNDS;
  }
  if (!isFiniteNumber(parsed.width) || !isFiniteNumber(parsed.height)) return DEFAULT_BOUNDS;
  const bounds: WindowBounds = {
    width: Math.max(MIN_WIDTH, Math.round(parsed.width)),
    height: Math.max(MIN_HEIGHT, Math.round(parsed.height)),
    maximized: parsed.maximized === true,
  };
  if (isFiniteNumber(parsed.x) && isFiniteNumber(parsed.y)) {
    const { x, y } = parsed;
    const visible = displays.some(
      (d) => x + 100 > d.x && x < d.x + d.width - 100 && y >= d.y && y < d.y + d.height - 100,
    );
    if (visible) {
      bounds.x = Math.round(x);
      bounds.y = Math.round(y);
    }
  }
  return bounds;
}
