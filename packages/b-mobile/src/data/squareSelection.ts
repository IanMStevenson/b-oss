// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Geometry for the pointer-fine thumbnail picker (b-oss#718): a square selection laid over the
// whole photo. A selection is a ThumbnailCrop (x, y, w as fractions of the displayed image; the
// height fraction is w * ratio, `ratio` being displayed width / height), so it feeds
// cropToProportions via the same percent area the touch cropper reports.

import type { CropAreaPercent, ThumbnailCrop } from './imageCrop.js';

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** Smallest and largest w for an image `ratio` wide-over-high whose source width is `naturalWidth`
 * pixels with a minimum square edge of `minEdge` pixels. */
export function widthLimits(
  ratio: number,
  naturalWidth: number,
  minEdge: number,
): { min: number; max: number } {
  const max = Math.min(1, 1 / ratio);
  const min = Math.min(max, (minEdge * 1.01) / naturalWidth);
  return { min, max };
}

/** Keeps the selection inside the image (w within limits, x/y so it fits). */
export function clampSelection(
  sel: ThumbnailCrop,
  ratio: number,
  limits: { min: number; max: number },
): ThumbnailCrop {
  const w = Math.min(limits.max, Math.max(limits.min, sel.w));
  const x = Math.min(1 - w, Math.max(0, sel.x));
  const y = Math.min(1 - w * ratio, Math.max(0, sel.y));
  return { x, y, w };
}

/** Moves the selection by a fraction of the image width (dx) and height (dy), staying inside. */
export function moveSelection(
  sel: ThumbnailCrop,
  dx: number,
  dy: number,
  ratio: number,
  limits: { min: number; max: number },
): ThumbnailCrop {
  return clampSelection({ ...sel, x: sel.x + dx, y: sel.y + dy }, ratio, limits);
}

/** Drags `corner` to the point (px, py), given as fractions of the image, keeping the opposite
 * corner fixed and the aspect square. The size follows the larger of the two pointer offsets,
 * then is limited by the minimum and by the room left to the image edges. */
export function resizeSelection(
  sel: ThumbnailCrop,
  corner: Corner,
  px: number,
  py: number,
  ratio: number,
  limits: { min: number; max: number },
): ThumbnailCrop {
  const h = sel.w * ratio;
  const anchorX = corner === 'nw' || corner === 'sw' ? sel.x + sel.w : sel.x;
  const anchorY = corner === 'nw' || corner === 'ne' ? sel.y + h : sel.y;
  const left = corner === 'nw' || corner === 'sw';
  const top = corner === 'nw' || corner === 'ne';
  // Room from the anchor to the image edge in the dragged direction.
  const roomW = left ? anchorX : 1 - anchorX;
  const roomH = top ? anchorY : 1 - anchorY;
  const wantW = Math.max(left ? anchorX - px : px - anchorX, 0);
  const wantH = Math.max(top ? anchorY - py : py - anchorY, 0);
  const raw = Math.max(wantW, wantH / ratio);
  const w = Math.min(limits.max, roomW, roomH / ratio, Math.max(limits.min, raw));
  return {
    x: left ? anchorX - w : anchorX,
    y: top ? anchorY - w * ratio : anchorY,
    w,
  };
}

export function selectionToArea(sel: ThumbnailCrop, ratio: number): CropAreaPercent {
  return { x: sel.x * 100, y: sel.y * 100, width: sel.w * 100, height: sel.w * ratio * 100 };
}

/** Vertical room kept for the app header, the frame's margins and the Done button, in px. */
export const SELECTOR_CHROME_PX = 260;

/** CSS width for the selector stage so the whole photo fits the viewport height as well as the
 * container width: the width is capped at (viewport height - chrome) * ratio, and the stage's
 * aspect-ratio then fixes its height at no more than viewport height - chrome. */
export function stageWidthCss(ratio: number, chromePx: number = SELECTOR_CHROME_PX): string {
  return `min(100%, calc((100vh - ${chromePx}px) * ${ratio}))`;
}
