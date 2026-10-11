// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Generates the Play store icon (512x512), the feature graphic (1024x500) and the themed-icon
// (monochrome) layers from the launcher's foreground glyph. Rendered in headless Chromium (no
// image library needed). Re-run after changing the launcher icon.
//
//   CHROME_PATH=/path/to/chrome node scripts/make-store-graphics.mjs        (CHROME_PATH optional)

import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android/app/src/main/res');
const outDir = join(root, 'store/graphics');
mkdirSync(outDir, { recursive: true });

const fg = readFileSync(join(res, 'mipmap-xxxhdpi/ic_launcher_foreground.png')).toString('base64');
const DENSITIES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });

// All pixel work runs in the page: find the white "b" in the foreground, then draw it.
const result = await page.evaluate(
  async ({ fg, DENSITIES }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${fg}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const plate = [...x.getImageData(80, 80, 1, 1).data];
    // The glyph: near-white, opaque pixels. Mask keeps only those.
    const mask = x.createImageData(c.width, c.height);
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let py = 0; py < c.height; py++) {
      for (let px = 0; px < c.width; px++) {
        const i = (py * c.width + px) * 4;
        if (d.data[i + 3] > 200 && d.data[i] > 225 && d.data[i + 1] > 225 && d.data[i + 2] > 225) {
          mask.data.set([255, 255, 255, 255], i);
          minX = Math.min(minX, px); maxX = Math.max(maxX, px);
          minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        }
      }
    }
    const gw = maxX - minX + 1;
    const gh = maxY - minY + 1;
    const mc = document.createElement('canvas');
    mc.width = c.width; mc.height = c.height;
    mc.getContext('2d').putImageData(mask, 0, 0);
    const rgb = `rgb(${plate[0]},${plate[1]},${plate[2]})`;

    // Draws the glyph centred, `frac` of the canvas tall.
    const glyph = (ctx, size, frac) => {
      const h = size * frac;
      const w = (gw / gh) * h;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mc, minX, minY, gw, gh, (size - w) / 2, (size - h) / 2, w, h);
    };

    const out = {};
    // Store icon: full-bleed square (Play applies its own mask).
    const ic = document.createElement('canvas');
    ic.width = ic.height = 512;
    const ix = ic.getContext('2d');
    ix.fillStyle = rgb; ix.fillRect(0, 0, 512, 512);
    glyph(ix, 512, 0.5);
    out.icon = ic.toDataURL('image/png');

    // Themed-icon layers: white glyph on transparent, filling the 66% safe zone sensibly.
    out.mono = {};
    for (const [name, s] of Object.entries(DENSITIES)) {
      const m = document.createElement('canvas');
      m.width = m.height = s;
      glyph(m.getContext('2d'), s, 0.46);
      out.mono[name] = m.toDataURL('image/png');
    }

    // Small rounded-square mark for the feature graphic.
    const mk = document.createElement('canvas');
    mk.width = mk.height = 512;
    const mx = mk.getContext('2d');
    mx.fillStyle = '#ffffff'; mx.globalAlpha = 0.0; mx.fillRect(0, 0, 512, 512); mx.globalAlpha = 1;
    mx.fillStyle = rgb;
    mx.beginPath(); mx.roundRect(0, 0, 512, 512, 112); mx.fill();
    glyph(mx, 512, 0.5);
    out.mark = mk.toDataURL('image/png');
    out.plate = rgb;
    return out;
  },
  { fg, DENSITIES },
);

const save = (p, url) => writeFileSync(p, Buffer.from(url.split(',')[1], 'base64'));
save(join(outDir, 'icon-512.png'), result.icon);
for (const [name, url] of Object.entries(result.mono)) {
  save(join(res, `mipmap-${name}/ic_launcher_monochrome.png`), url);
}

// Feature graphic, 1024x500. Keep the content in the middle: Play crops the edges on some surfaces.
await page.setContent(`<!doctype html><html><body style="margin:0;width:1024px;height:500px;
  background:linear-gradient(135deg,#1f4d3a 0%,#143428 100%);font-family:'Helvetica Neue',Arial,sans-serif;
  display:flex;align-items:center;justify-content:center;gap:56px;color:#fff;overflow:hidden">
  <img src="${result.mark}" width="200" height="200" style="border-radius:44px;box-shadow:0 14px 40px rgba(0,0,0,.35),0 0 0 3px rgba(255,255,255,.22)">
  <div>
    <div style="font-size:70px;font-weight:700;letter-spacing:-1px;line-height:1.05">b-mobile</div>
    <div style="font-size:42px;font-weight:500;opacity:.92;margin-top:4px">for Blipfoto</div>
    <div style="font-size:26px;font-weight:400;opacity:.75;margin-top:22px;max-width:520px;line-height:1.3">
      Browse, post and get notified<br>on your journal. Free and open source.</div>
  </div></body></html>`);
await page.screenshot({ path: join(outDir, 'feature-graphic-1024x500.png'), clip: { x: 0, y: 0, width: 1024, height: 500 } });
await browser.close();
console.log('wrote', outDir, 'and ic_launcher_monochrome.png x5');
