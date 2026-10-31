// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Tells sub-pixel (LCD) text from grayscale text in a screenshot crop (b-oss#676). Grayscale
// anti-aliasing blends the text colour into the background equally in all three channels; sub-pixel
// anti-aliasing does not, so glyph edges show coloured fringes. For every edge pixel (text coverage
// between 15% and 85%) the coverage is worked out per colour channel against the crop's background
// (its most common colour) and text colour (its furthest colour); an edge pixel is "fringed" when
// the channels disagree by more than 0.2. `ratio` is fringed / edge: about 0.5-0.95 for LCD text and
// 0 for grayscale text. The function runs in the page (it needs a canvas to decode the PNG) and is
// self-contained for that reason.

export interface LcdReading {
  edge: number;
  fringed: number;
  ratio: number;
}

export function measureLcdInPage(b64: string): Promise<LcdReading> {
  return (async () => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const n = bmp.width * bmp.height;
    const counts = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const k = ((d[i * 4] ?? 0) << 16) | ((d[i * 4 + 1] ?? 0) << 8) | (d[i * 4 + 2] ?? 0);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let bgKey = 0;
    let bgCount = 0;
    for (const [k, v] of counts) {
      if (v > bgCount) {
        bgCount = v;
        bgKey = k;
      }
    }
    const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255];
    let fg = bg;
    let far = 0;
    for (const k of counts.keys()) {
      const p = [(k >> 16) & 255, (k >> 8) & 255, k & 255];
      const dist =
        Math.abs((p[0] ?? 0) - (bg[0] ?? 0)) +
        Math.abs((p[1] ?? 0) - (bg[1] ?? 0)) +
        Math.abs((p[2] ?? 0) - (bg[2] ?? 0));
      if (dist > far) {
        far = dist;
        fg = p;
      }
    }
    const channels = [0, 1, 2].filter((c) => Math.abs((fg[c] ?? 0) - (bg[c] ?? 0)) >= 60);
    let edge = 0;
    let fringed = 0;
    if (far >= 150 && channels.length >= 2) {
      for (let i = 0; i < n; i++) {
        const a = channels.map(
          (c) => ((d[i * 4 + c] ?? 0) - (bg[c] ?? 0)) / ((fg[c] ?? 0) - (bg[c] ?? 0)),
        );
        const mean = a.reduce((s, v) => s + v, 0) / a.length;
        if (mean < 0.15 || mean > 0.85) continue;
        edge++;
        if (Math.max(...a) - Math.min(...a) > 0.2) fringed++;
      }
    }
    return { edge, fringed, ratio: edge ? fringed / edge : 0 };
  })();
}
