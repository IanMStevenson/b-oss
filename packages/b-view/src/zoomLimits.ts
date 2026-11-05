// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export const ZOOM_MIN_PERCENT = 30;
export const ZOOM_MAX_PERCENT = 200;
export const ZOOM_STEP_PERCENT = 10;

export interface ZoomLimits {
  min: number;
  max: number;
}

/** The zoom range for a container. The minimum is derived from the container width (so zoom-out
 * never packs in more than the intended number of columns), but it is capped one step below the
 * maximum: with a small base tile on a wide window the derived value used to exceed the maximum,
 * leaving the control able to switch only between the maximum and the derived value. `width` of 0
 * (not measured yet) gives the flat floor. */
export function zoomLimits(width: number, minColumns: number, baseTileSize: number): ZoomLimits {
  const derived =
    width > 0 ? Math.round((width / minColumns / baseTileSize) * 100) : ZOOM_MIN_PERCENT;
  return { min: Math.min(derived, ZOOM_MAX_PERCENT - ZOOM_STEP_PERCENT), max: ZOOM_MAX_PERCENT };
}

/** One zoom step in a direction. Out never goes below the minimum and in never above the maximum;
 * a stored value on the far side of a limit is not snapped (only stepped), exactly as the buttons
 * have always behaved. */
export function stepZoom(current: number, direction: 1 | -1, limits: ZoomLimits): number {
  return direction === 1
    ? Math.min(limits.max, current + ZOOM_STEP_PERCENT)
    : Math.max(limits.min, current - ZOOM_STEP_PERCENT);
}
