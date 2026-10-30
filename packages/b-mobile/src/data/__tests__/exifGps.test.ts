// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { readExifGps } from '../exifGps.js';

type Rational = [number, number];

/** Builds a minimal JPEG (SOI + Exif APP1 + EOI) holding only a GPS IFD. */
function buildJpeg(opts: {
  little?: boolean;
  latRef?: string;
  lat?: [Rational, Rational, Rational];
  lonRef?: string;
  lon?: [Rational, Rational, Rational];
  noGps?: boolean;
}): Uint8Array {
  const little = opts.little ?? false;
  const tiff: number[] = [];
  const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) =>
    little
      ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]
      : [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];

  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(0x2a), ...u32(8));
  if (opts.noGps) {
    tiff.push(...u16(0), ...u32(0));
  } else {
    // IFD0 at 8: one entry (GPSInfo pointer) -> GPS IFD at 26.
    tiff.push(...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
    // GPS IFD at 26: 4 entries = 2 + 48 + 4 = 54 bytes -> rational data from 80.
    const latAt = 80;
    const lonAt = 104;
    tiff.push(...u16(4));
    tiff.push(...u16(1), ...u16(2), ...u32(2), opts.latRef!.charCodeAt(0), 0, 0, 0);
    tiff.push(...u16(2), ...u16(5), ...u32(3), ...u32(latAt));
    tiff.push(...u16(3), ...u16(2), ...u32(2), opts.lonRef!.charCodeAt(0), 0, 0, 0);
    tiff.push(...u16(4), ...u16(5), ...u32(3), ...u32(lonAt));
    tiff.push(...u32(0));
    for (const group of [opts.lat!, opts.lon!]) {
      for (const [n, d] of group) tiff.push(...u32(n), ...u32(d));
    }
  }
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const segLen = exif.length + 2;
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, segLen >> 8, segLen & 255, ...exif, 0xff, 0xd9,
  ]);
}

describe('readExifGps', () => {
  it('reads north/west co-ordinates (big-endian)', () => {
    const jpeg = buildJpeg({
      latRef: 'N',
      lat: [[55, 1], [57, 1], [3000, 100]],
      lonRef: 'W',
      lon: [[3, 1], [12, 1], [4500, 100]],
    });
    const gps = readExifGps(jpeg);
    expect(gps?.lat).toBeCloseTo(55.958333, 5);
    expect(gps?.lon).toBeCloseTo(-3.2125, 5);
  });

  it('reads south/east co-ordinates (little-endian)', () => {
    const jpeg = buildJpeg({
      little: true,
      latRef: 'S',
      lat: [[33, 1], [51, 1], [0, 1]],
      lonRef: 'E',
      lon: [[151, 1], [12, 1], [0, 1]],
    });
    const gps = readExifGps(jpeg);
    expect(gps?.lat).toBeCloseTo(-33.85, 5);
    expect(gps?.lon).toBeCloseTo(151.2, 5);
  });

  it('returns null when there is no GPS block', () => {
    expect(readExifGps(buildJpeg({ noGps: true }))).toBeNull();
  });

  it('treats 0/0 as no fix', () => {
    const jpeg = buildJpeg({
      latRef: 'N',
      lat: [[0, 1], [0, 1], [0, 1]],
      lonRef: 'E',
      lon: [[0, 1], [0, 1], [0, 1]],
    });
    expect(readExifGps(jpeg)).toBeNull();
  });

  it('returns null for zero denominators', () => {
    const jpeg = buildJpeg({
      latRef: 'N',
      lat: [[55, 0], [0, 1], [0, 1]],
      lonRef: 'E',
      lon: [[3, 1], [0, 1], [0, 1]],
    });
    expect(readExifGps(jpeg)).toBeNull();
  });

  it('returns null for non-JPEG or truncated input', () => {
    expect(readExifGps(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(readExifGps(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff]))).toBeNull();
    expect(readExifGps(new Uint8Array())).toBeNull();
  });
});
