// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Screenshot diff of two b-mobile builds against the SAME stub API (b-oss#770 Lens 1, rerun by
// b-oss#772). Builds nothing: point it at two checked-out worktrees that have `npm ci` done.
//
//   node packages/b-mobile/scripts/compare-shots.mjs --a <dirA> --b <dirB> --out <outDir> \
//        [--stub-port 5192] [--ports 5193,5194] [--themes light,dark,mid] [--safe-areas off,on] \
//        [--threshold 24] [--noise] [--skip-capture]
//
// For each theme x safe-area it runs scripts/screenshots.mjs (this checkout's copy, so both builds
// get the identical sweep) against a vite dev server per worktree, both proxied to one stub
// (taken from <dirB>), then diffs every PNG. A pixel differs when any RGB channel is further than
// --threshold (0-255) apart. Output: <out>/shots/<a|b>/<theme>-<sa>/*.png,
// <out>/diff/<theme>-<sa>/*.png (A dimmed, differing pixels red), <out>/report.json, report.md.
// --noise also captures A a second time (light, safe-area off) to measure run-to-run flakiness.
// No dependencies beyond playwright-core (already needed by screenshots.mjs): PNG decode/encode
// is done here with node:zlib, for 8-bit non-interlaced RGB/RGBA as Chromium writes.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);

const dirA = resolve(opt('a'));
const dirB = resolve(opt('b'));
const out = resolve(opt('out'));
const stubPort = opt('stub-port', '5192');
const [portA, portB] = opt('ports', '5193,5194').split(',');
const themes = opt('themes', 'light,dark,mid').split(',');
const safeAreas = opt('safe-areas', 'off,on').split(',');
const threshold = Number(opt('threshold', '24'));
const SAFE_AREA_VALUE = '34,48';

// ---- PNG ---------------------------------------------------------------------------------
function readPng(file) {
  const buf = readFileSync(file);
  let pos = 8;
  let w = 0;
  let h = 0;
  let bpp = 4;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const depth = data[8];
      const colour = data[9];
      if (depth !== 8 || data[12] !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(`${file}: unsupported PNG (depth ${depth}, colour ${colour})`);
      }
      bpp = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4, 255);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (f === 1) add = a;
      else if (f === 2) add = b;
      else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = line[x * bpp];
      px[o + 1] = line[x * bpp + 1];
      px[o + 2] = line[x * bpp + 2];
      if (bpp === 4) px[o + 3] = line[x * bpp + 3];
    }
    prev = line;
  }
  return { w, h, px };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function writePng(file, { w, h, px }) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

// Compare two PNGs. Returns stats and, when anything differs, the red-on-dimmed diff image.
function diffPng(fileA, fileB) {
  const a = readPng(fileA);
  const b = readPng(fileB);
  if (a.w !== b.w || a.h !== b.h) {
    return { sizeA: `${a.w}x${a.h}`, sizeB: `${b.w}x${b.h}`, sizeMismatch: true, pct: 100 };
  }
  const img = Buffer.alloc(a.px.length);
  let n = 0;
  let minX = a.w;
  let minY = a.h;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < a.px.length; i += 4) {
    const d = Math.max(
      Math.abs(a.px[i] - b.px[i]),
      Math.abs(a.px[i + 1] - b.px[i + 1]),
      Math.abs(a.px[i + 2] - b.px[i + 2]),
    );
    if (d > threshold) {
      n++;
      img[i] = 255;
      img[i + 1] = 0;
      img[i + 2] = 0;
      img[i + 3] = 255;
      const p = i / 4;
      const x = p % a.w;
      const y = (p - x) / a.w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      // Dim A towards white so the red stands out.
      img[i] = 255 - (255 - a.px[i]) * 0.3;
      img[i + 1] = 255 - (255 - a.px[i + 1]) * 0.3;
      img[i + 2] = 255 - (255 - a.px[i + 2]) * 0.3;
      img[i + 3] = 255;
    }
  }
  const total = a.w * a.h;
  return {
    sizeA: `${a.w}x${a.h}`,
    sizeB: `${b.w}x${b.h}`,
    pct: (100 * n) / total,
    pixels: n,
    bbox: n ? [minX, minY, maxX, maxY] : null,
    image: n ? { w: a.w, h: a.h, px: img } : null,
  };
}

// ---- servers -----------------------------------------------------------------------------
const procs = [];
function start(name, cmd, args, cwd, env = {}) {
  mkdirSync(out, { recursive: true });
  const p = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  });
  p.unref();
  procs.push({ name, p });
  return p;
}
function stopAll() {
  for (const { p } of procs) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}
process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(130));

async function waitFor(url, label) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not come up at ${url}`);
}

function capture(dir, port, outDir, theme, safeArea) {
  mkdirSync(outDir, { recursive: true });
  const env = { ...process.env, STUB_PORT: stubPort, THEME: theme };
  if (safeArea === 'on') env.SAFE_AREA = SAFE_AREA_VALUE;
  else delete env.SAFE_AREA;
  const script = join(dirname(fileURLToPath(import.meta.url)), 'screenshots.mjs');
  const r = spawnSync('node', [script, outDir, `http://127.0.0.1:${port}`], {
    cwd: join(dir, 'packages/b-mobile'),
    env,
    encoding: 'utf8',
    timeout: 20 * 60 * 1000,
  });
  writeFileSync(join(outDir, 'capture.log'), `${r.stdout}\n${r.stderr}`);
  if (r.status !== 0) console.error(`capture failed in ${outDir} (exit ${r.status})`);
}

// ---- run ---------------------------------------------------------------------------------
mkdirSync(out, { recursive: true });
if (!flag('skip-capture')) {
  const stubJs = join(dirB, 'packages/b-mobile/scripts/stub-api.mjs');
  start('stub', 'node', [stubJs, stubPort], dirB);
  const viteEnv = {
    B_API_PROXY_TARGET: `http://127.0.0.1:${stubPort}`,
    VITE_DEV_TOKEN: 'stub-dev-token',
  };
  for (const [dir, port] of [
    [dirA, portA],
    [dirB, portB],
  ]) {
    start(
      `vite-${port}`,
      join(dir, 'node_modules/.bin/vite'),
      ['--port', port, '--host', '127.0.0.1', '--strictPort'],
      join(dir, 'packages/b-mobile'),
      viteEnv,
    );
  }
  await waitFor(`http://127.0.0.1:${stubPort}/`, 'stub');
  await waitFor(`http://127.0.0.1:${portA}/`, 'vite A');
  await waitFor(`http://127.0.0.1:${portB}/`, 'vite B');
  for (const theme of themes) {
    for (const sa of safeAreas) {
      const tag = `${theme}-${sa === 'on' ? 'sa' : 'nosa'}`;
      console.log('capture', tag);
      capture(dirA, portA, join(out, 'shots/a', tag), theme, sa);
      capture(dirB, portB, join(out, 'shots/b', tag), theme, sa);
    }
  }
  if (flag('noise')) {
    console.log('capture noise (A again, light, no safe area)');
    capture(dirA, portA, join(out, 'shots/a2', 'light-nosa'), 'light', 'off');
  }
  stopAll();
}

const pngs = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.png')) : []);
const rows = [];
function compare(label, dA, dB, diffDir) {
  mkdirSync(diffDir, { recursive: true });
  const fa = new Set(pngs(dA));
  const fb = new Set(pngs(dB));
  for (const f of [...new Set([...fa, ...fb])].sort()) {
    const row = { config: label, file: f };
    if (!fa.has(f) || !fb.has(f)) {
      row.onlyIn = fa.has(f) ? 'A' : 'B';
    } else {
      const d = diffPng(join(dA, f), join(dB, f));
      const { image, ...stats } = d;
      Object.assign(row, stats);
      if (image) writePng(join(diffDir, f), image);
    }
    rows.push(row);
  }
}
for (const theme of themes) {
  for (const sa of safeAreas) {
    const tag = `${theme}-${sa === 'on' ? 'sa' : 'nosa'}`;
    console.log('diff', tag);
    compare(tag, join(out, 'shots/a', tag), join(out, 'shots/b', tag), join(out, 'diff', tag));
  }
}
const noiseRows = [];
if (existsSync(join(out, 'shots/a2'))) {
  const keep = rows.length;
  compare(
    'noise(A vs A)',
    join(out, 'shots/a/light-nosa'),
    join(out, 'shots/a2/light-nosa'),
    join(out, 'diff/noise'),
  );
  noiseRows.push(...rows.splice(keep));
}
writeFileSync(join(out, 'report.json'), JSON.stringify({ threshold, rows, noiseRows }, null, 1));
const fmt = (r) =>
  r.onlyIn
    ? `| ${r.config} | ${r.file} | only in ${r.onlyIn} | |`
    : `| ${r.config} | ${r.file} | ${r.pct.toFixed(3)}% | ${r.sizeMismatch ? `size ${r.sizeA} vs ${r.sizeB}` : (r.bbox ?? []).join(',')} |`;
const changed = rows.filter((r) => r.onlyIn || r.pct > 0);
writeFileSync(
  join(out, 'report.md'),
  [
    `threshold ${threshold}/255 per channel; ${rows.length} screenshots compared, ${changed.length} differ.`,
    '',
    '| config | screen | % pixels differ | bbox x1,y1,x2,y2 (2x px) |',
    '|---|---|---|---|',
    ...changed.map(fmt),
    '',
    '## Noise (A vs A, light, no safe area)',
    ...noiseRows.filter((r) => r.onlyIn || r.pct > 0).map(fmt),
  ].join('\n'),
);
console.log(`report: ${join(out, 'report.md')} (${changed.length} of ${rows.length} differ)`);
