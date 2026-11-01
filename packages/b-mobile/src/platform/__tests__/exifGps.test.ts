// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { readExifGps } from '../exifGps.js';

interface Opts {
  little?: boolean;
  latRef?: string;
  lonRef?: string;
  lat?: [number, number, number];
  lon?: [number, number, number];
  omitGps?: boolean;
}

/** Builds a minimal JPEG: SOI + APP1/Exif (IFD0 -> GPS IFD) + EOI. */
function jpeg(o: Opts = {}): Uint8Array {
  const little = o.little ?? false;
  const lat = o.lat ?? [51, 30, 0];
  const lon = o.lon ?? [0, 7, 30];
  const tiff = new DataView(new ArrayBuffer(200));
  const u16 = (at: number, v: number) => tiff.setUint16(at, v, little);
  const u32 = (at: number, v: number) => tiff.setUint32(at, v, little);
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  u16(2, 42);
  u32(4, 8);
  // IFD0 at 8: one entry, GPS IFD pointer -> 26
  u16(8, 1);
  u16(10, 0x8825);
  u16(12, 4);
  u32(14, 1);
  u32(18, 26);
  u32(22, 0);
  // GPS IFD at 26: 4 entries; rationals at 80 (lat) and 104 (lon)
  u16(26, 4);
  const entry = (i: number, tag: number, type: number, count: number, value: () => void) => {
    const at = 28 + i * 12;
    u16(at, tag);
    u16(at + 2, type);
    u32(at + 4, count);
    value.call(null);
    return at + 8;
  };
  let at = entry(0, 1, 2, 2, () => {});
  tiff.setUint8(at, (o.latRef ?? 'N').charCodeAt(0));
  at = entry(1, 2, 5, 3, () => {});
  u32(at, 80);
  at = entry(2, 3, 2, 2, () => {});
  tiff.setUint8(at, (o.lonRef ?? 'E').charCodeAt(0));
  at = entry(3, 4, 5, 3, () => {});
  u32(at, 104);
  [...lat, ...lon].forEach((v, i) => {
    u32(80 + i * 8, v);
    u32(84 + i * 8, 1);
  });
  const body = new Uint8Array(tiff.buffer);
  const exif = new Uint8Array(6 + body.length);
  exif.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  exif.set(body, 6);
  if (o.omitGps) new DataView(exif.buffer).setUint16(6 + 8, 0, little);
  const seg = new Uint8Array(4 + exif.length);
  seg.set([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff]);
  seg.set(exif, 4);
  return Uint8Array.from([0xff, 0xd8, ...seg, 0xff, 0xd9]);
}

describe('readExifGps', () => {
  it('reads degrees/minutes/seconds, big-endian', () => {
    expect(readExifGps(jpeg())).toEqual({ lat: 51.5, lon: 0.125 });
  });

  it('reads little-endian EXIF', () => {
    expect(readExifGps(jpeg({ little: true }))).toEqual({ lat: 51.5, lon: 0.125 });
  });

  it('applies S and W as negative', () => {
    expect(readExifGps(jpeg({ latRef: 'S', lonRef: 'W' }))).toEqual({ lat: -51.5, lon: -0.125 });
  });

  it('returns null when there is no GPS block', () => {
    expect(readExifGps(jpeg({ omitGps: true }))).toBeNull();
  });

  it('treats 0,0 as no fix', () => {
    expect(readExifGps(jpeg({ lat: [0, 0, 0], lon: [0, 0, 0] }))).toBeNull();
  });

  it('rejects out-of-range coordinates', () => {
    expect(readExifGps(jpeg({ lat: [95, 0, 0] }))).toBeNull();
  });

  it('returns null for non-JPEG, empty or truncated input', () => {
    expect(readExifGps(new Uint8Array())).toBeNull();
    expect(readExifGps(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(readExifGps(jpeg().slice(0, 40))).toBeNull();
  });
});
