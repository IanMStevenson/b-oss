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

export function cropToProportions(area: CropAreaPercent): ThumbnailCrop {
  return {
    x: round4(area.x / 100),
    y: round4(area.y / 100),
    w: round4(area.width / 100),
  };
}

export function thumbnailCropToField(crop: ThumbnailCrop): string {
  return `${crop.x},${crop.y},${crop.w}`;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** react-easy-crop's onCropComplete second argument — the same rect in source-image pixels,
 * which is what a canvas crop needs (SCR-25's avatar path). */
export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Draws the given pixel region of `imageSrc` onto a canvas and re-encodes it as a JPEG Blob.
 * `imageSrc` is anything an <img> can load (a blob:/data: URL or a remote URL) — the caller is
 * responsible for producing one from whatever platform/camera.ts returned. */
export function cropToJpegBlob(
  imageSrc: string,
  area: CropAreaPixels,
  quality = 0.9,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(area.width);
      canvas.height = Math.round(area.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get a 2D canvas context to crop the image.'));
        return;
      }
      ctx.drawImage(
        img,
        area.x,
        area.y,
        area.width,
        area.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Could not encode the cropped image.'));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => reject(new Error('Could not load the image to crop.'));
    img.src = imageSrc;
  });
}
