// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Reads the GPS position embedded in a JPEG's EXIF block (b-oss#740). Needed on desktop, where the
// picker is a plain file input that returns no metadata; Android uses the native PhotoPick plugin.
// Pure bytes-in, position-out, so it works whatever supplies the bytes. Only the first APP1/Exif
// segment is read, and any malformed input yields null rather than throwing.

export interface ExifPosition {
  lat: number;
  lon: number;
}

const TAG_GPS_IFD = 0x8825;
const TAG_LAT_REF = 1;
const TAG_LAT = 2;
const TAG_LON_REF = 3;
const TAG_LON = 4;
const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;

/** The GPS position in a JPEG's EXIF data, or null when absent, unreadable or not a JPEG. */
export function readExifGps(bytes: Uint8Array): ExifPosition | null {
  try {
    return parse(bytes);
  } catch {
    return null;
  }
}

function parse(bytes: Uint8Array): ExifPosition | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  // Walk the marker segments to the Exif APP1 block.
  let pos = 2;
  let tiff = -1;
  while (pos + 4 <= view.byteLength) {
    if (view.getUint8(pos) !== 0xff) return null;
    const marker = view.getUint8(pos + 1);
    if (marker === 0xda || marker === 0xd9) break; // image data / end: no Exif before it
    const length = view.getUint16(pos + 2);
    if (marker === 0xe1 && length >= 8 && view.getUint32(pos + 4) === 0x45786966) {
      tiff = pos + 10; // after "Exif\0\0"
      break;
    }
    pos += 2 + length;
  }
  if (tiff < 0) return null;

  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 42) return null;

  const gpsIfd = findEntry(view, tiff + view.getUint32(tiff + 4, little), little, TAG_GPS_IFD);
  if (!gpsIfd) return null;
  const gpsStart = tiff + view.getUint32(gpsIfd.valueAt, little);

  const latRef = readRef(view, gpsStart, little, TAG_LAT_REF);
  const lonRef = readRef(view, gpsStart, little, TAG_LON_REF);
  const lat = readDms(view, tiff, gpsStart, little, TAG_LAT);
  const lon = readDms(view, tiff, gpsStart, little, TAG_LON);
  if (lat == null || lon == null) return null;

  const signedLat = latRef === 'S' ? -lat : lat;
  const signedLon = lonRef === 'W' ? -lon : lon;
  if (Math.abs(signedLat) > 90 || Math.abs(signedLon) > 180) return null;
  // Cameras write 0,0 when they have no fix; treat that as no position.
  if (signedLat === 0 && signedLon === 0) return null;
  return { lat: signedLat, lon: signedLon };
}

interface Entry {
  type: number;
  count: number;
  /** Offset of the 4-byte value/offset field. */
  valueAt: number;
}

function findEntry(view: DataView, ifd: number, little: boolean, tag: number): Entry | null {
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    if (view.getUint16(at, little) === tag) {
      return {
        type: view.getUint16(at + 2, little),
        count: view.getUint32(at + 4, little),
        valueAt: at + 8,
      };
    }
  }
  return null;
}

function readRef(view: DataView, ifd: number, little: boolean, tag: number): string {
  const e = findEntry(view, ifd, little, tag);
  if (!e || e.type !== TYPE_ASCII || e.count < 1) return '';
  return String.fromCharCode(view.getUint8(e.valueAt)); // ≤4 bytes, stored inline
}

function readDms(
  view: DataView,
  tiff: number,
  ifd: number,
  little: boolean,
  tag: number,
): number | null {
  const e = findEntry(view, ifd, little, tag);
  if (!e || e.type !== TYPE_RATIONAL || e.count !== 3) return null;
  const at = tiff + view.getUint32(e.valueAt, little);
  const parts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const num = view.getUint32(at + i * 8, little);
    const den = view.getUint32(at + i * 8 + 4, little);
    if (den === 0) return null;
    parts.push(num / den);
  }
  const [d, m, s] = parts as [number, number, number];
  return d + m / 60 + s / 3600;
}
