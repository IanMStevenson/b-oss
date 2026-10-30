// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shared crop math/utilities behind components/PhotoCropper.tsx (§15). The two crop operations
// are genuinely different and must not be conflated:
//   - SCR-10 (entry thumbnail, this phase): a *coordinate* crop — thumbnail_crop as x,y,w floats
//     in 0.0-1.0, sent alongside the untouched photo. `cropToProportions` below is all this needs.
//   - SCR-25 (avatar, Phase 8 screen — this utility is built now per the Phase 7 plan since the
//     cropper component itself is shared): a *pixel* crop — canvas-drawn and re-encoded to a JPEG
//     Blob, since the avatar field has no crop-coordinate parameter. `cropToJpegBlob` below.
//
// Neither of these touches Capacitor — canvas/Image/HTMLCanvasElement are standard Web APIs
// available in a WebView with no plugin, so this stays in src/data/, not src/platform/.

/** react-easy-crop's onCropComplete callback gives a percentage-based crop rect (0-100, of the
 * *displayed* image) as its first argument — exactly what thumbnail_crop needs, just rescaled to
 * 0.0-1.0. `w` alone is sent (per app-architecture.md §15: "one width, because it's square") —
 * callers using a square aspect (SCR-10 always does) can rely on width and height being equal. */
export interface CropAreaPercent {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ThumbnailCrop {
  x: number;
  y: number;
  w: number;
}

/** The API rejects a thumbnail_crop narrower than this many source pixels (w * width >= 300). */
export const THUMBNAIL_MIN_EDGE = 300;
/** Headroom over the minimum so flooring to 4 decimals can't land a crop just under it. */
const THUMBNAIL_EDGE_MARGIN = 1.01;

/** Whether a photo's shorter edge can hold a square thumbnail of the minimum size. Unknown
 * dimensions are given the benefit of the doubt; the cropper measures the real image. */
export function canSelectThumbnail(width: number | null, height: number | null): boolean {
  if (width === null || height === null) return true;
  return Math.min(width, height) >= Math.ceil(THUMBNAIL_MIN_EDGE * THUMBNAIL_EDGE_MARGIN);
}

/** The highest react-easy-crop zoom that keeps the (square) crop at least the minimum edge: at
 * zoom z the crop's side is the image's shorter edge / z. Never below 1. */
export function maxZoomForMinEdge(width: number, height: number, minEdge: number): number {
  return Math.max(1, Math.min(width, height) / (minEdge * THUMBNAIL_EDGE_MARGIN));
}

/** The crop the API uses when none is sent: a centred square covering 88% of the shorter edge.
 * `ratio` is the displayed image's width / height. */
export function defaultThumbnailCrop(ratio: number): ThumbnailCrop {
  const w = ratio >= 1 ? 0.88 / ratio : 0.88;
  return { x: round4((1 - w) / 2), y: round4((1 - w * ratio) / 2), w: round4(w) };
}

/** A crop as the percentage rect (0-100 of the displayed image) react-easy-crop starts from. */
export function thumbnailCropToArea(crop: ThumbnailCrop, ratio: number): CropAreaPercent {
  return {
    x: crop.x * 100,
    y: crop.y * 100,
    width: crop.w * 100,
    height: crop.w * ratio * 100,
  };
}

export function cropToProportions(area: CropAreaPercent): ThumbnailCrop {
  // The API rejects (and silently replaces with its default crop) any thumbnail_crop where
  // x + w > 1 or y + w*width/height > 1, so values are floored, never rounded up, and w is capped
  // by both limits. w*width/height is the crop's height as a fraction, i.e. area.height / 100.
  const x = floor4(area.x / 100);
  const y = floor4(area.y / 100);
  const horizontalCap = 1 - x;
  const verticalCap = area.height > 0 ? ((1 - y) * area.width) / area.height : horizontalCap;
  let w = floor4(Math.min(area.width / 100, horizontalCap, verticalCap));
  // A crop that exactly fills the image sits on the limit, where float error on the server's side
  // of the comparison could still tip it over; step one unit inside.
  const heightFraction = area.width > 0 ? (w * area.height) / area.width : 0;
  if (x + w > 1 - EPSILON || y + heightFraction > 1 - EPSILON) w = Math.max(0, w - 0.0001);
  return { x, y, w };
}

export function thumbnailCropToField(crop: ThumbnailCrop): string {
  return `${crop.x},${crop.y},${crop.w}`;
}

const EPSILON = 1e-9;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function floor4(n: number): number {
  return Math.max(0, Math.floor(n * 10000 + EPSILON) / 10000);
}

/** react-easy-crop's onCropComplete second argument — the same rect in source-image pixels,
 * which is what a canvas crop needs (SCR-25's avatar path). */
export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Longest edge of an uploaded avatar. Blipfoto shows avatars small; a full camera crop
 * (4000px+) only risks the 3 MB cap (data/photoValidation.ts) and slow uploads. */
export const AVATAR_MAX_EDGE = 1024;
/** Blipfoto's hard cap is 3 MB; stay clear of it so multipart framing never tips it over. */
export const AVATAR_TARGET_BYTES = 2.5 * 1024 * 1024;
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.55];

/** Output size for a crop area: the area's own size, scaled down (never up) so its longest edge
 * is at most `maxEdge`. Whole pixels, at least 1. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Encodes with decreasing JPEG quality, then decreasing size, until the result is at most
 * `maxBytes`. `encode(edge, quality)` renders the image with its longest edge at `edge`. Returns
 * the smallest attempt if nothing fits (the server then reports the real reason). */
export async function encodeUnderLimit(
  encode: (maxEdge: number, quality: number) => Promise<Blob>,
  maxBytes: number,
  startEdge: number,
): Promise<Blob> {
  let edge = startEdge;
  let last: Blob | null = null;
  for (let round = 0; round < 3; round++) {
    for (const quality of QUALITY_STEPS) {
      last = await encode(edge, quality);
      if (last.size <= maxBytes) return last;
    }
    edge = Math.max(300, Math.round(edge / 2));
  }
  return last as Blob;
}

function loadImage(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image to crop.'));
    img.src = imageSrc;
  });
}

/** Draws the given pixel region of `imageSrc` onto a canvas and re-encodes it as a JPEG Blob,
 * downscaled to `maxEdge` and, for the avatar, squeezed under `maxBytes`. `imageSrc` is anything
 * an <img> can load (a blob:/data: URL or a remote URL). The browser decodes EXIF orientation
 * itself, so the crop rect (which react-easy-crop measures on the displayed image) lines up.
 * Any transparency (PNG) is flattened onto white, since JPEG has no alpha. */
export async function cropToJpegBlob(
  imageSrc: string,
  area: CropAreaPixels,
  options: { maxEdge?: number; maxBytes?: number } = {},
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const render = (maxEdge: number, quality: number): Promise<Blob> => {
    const size = fitWithin(area.width, area.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx)
      return Promise.reject(new Error('Could not get a 2D canvas context to crop the image.'));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the cropped image.'))),
        'image/jpeg',
        quality,
      );
    });
  };
  return encodeUnderLimit(
    render,
    options.maxBytes ?? AVATAR_TARGET_BYTES,
    options.maxEdge ?? AVATAR_MAX_EDGE,
  );
}
