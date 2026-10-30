// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Reads the GPS position embedded in a JPEG's EXIF block. Blipfoto's server never reads GPS from
// the uploaded image, so the client has to: the result is sent as lat/lon (signed decimal degrees,
// south and west negative). Pure and platform-free: takes the leading bytes of the file.
//
// Only what is needed is parsed: JPEG APP1 "Exif" segment -> TIFF header -> IFD0 -> GPSInfo
// pointer (0x8825) -> GPS IFD tags 1-4 (latitude/longitude and their N/S, E/W references).

export interface ExifGps {
  lat: number;
  lon: number;
}

const TAG_GPS_IFD = 0x8825;
const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;

/** Bytes worth reading from the start of a JPEG: the Exif segment is at most 64 KiB. */
export const EXIF_READ_BYTES = 128 * 1024;

export function readExifGps(bytes: Uint8Array): ExifGps | null {
  try {
    return parse(bytes);
  } catch {
    return null;
  }
}

function parse(bytes: Uint8Array): ExifGps | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) return null; // image data / end: no Exif seen
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && isExifHeader(view, offset + 4)) {
      return parseTiff(view, offset + 10);
    }
    offset += 2 + length;
  }
  return null;
}

function isExifHeader(view: DataView, at: number): boolean {
  return (
    at + 6 <= view.byteLength &&
    view.getUint32(at) === 0x45786966 && // "Exif"
    view.getUint16(at + 4) === 0
  );
}

function parseTiff(view: DataView, tiff: number): ExifGps | null {
  const byteOrder = view.getUint16(tiff);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiff + 2, little) !== 0x002a) return null;

  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  const gpsPointer = findTag(view, ifd0, TAG_GPS_IFD, little);
  if (!gpsPointer) return null;
  const gpsIfd = tiff + view.getUint32(gpsPointer.valueAt, little);

  const latRef = readAscii(view, tiff, gpsIfd, 1, little);
  const lat = readRationals(view, tiff, gpsIfd, 2, little);
  const lonRef = readAscii(view, tiff, gpsIfd, 3, little);
  const lon = readRationals(view, tiff, gpsIfd, 4, little);
  if (!latRef || !lat || !lonRef || !lon) return null;

  const latitude = toDecimal(lat) * (latRef === 'S' ? -1 : 1);
  const longitude = toDecimal(lon) * (lonRef === 'W' ? -1 : 1);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // Cameras write 0/0/0 when they had no fix; that is "no position", not Null Island.
  if (latitude === 0 && longitude === 0) return null;
  return { lat: latitude, lon: longitude };
}

interface IfdEntry {
  type: number;
  count: number;
  /** Offset of the 4-byte value/offset field within the file. */
  valueAt: number;
}

function findTag(view: DataView, ifd: number, tag: number, little: boolean): IfdEntry | null {
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (view.getUint16(entry, little) === tag) {
      return {
        type: view.getUint16(entry + 2, little),
        count: view.getUint32(entry + 4, little),
        valueAt: entry + 8,
      };
    }
  }
  return null;
}

function readAscii(
  view: DataView,
  tiff: number,
  ifd: number,
  tag: number,
  little: boolean,
): string | null {
  const entry = findTag(view, ifd, tag, little);
  if (!entry || entry.type !== TYPE_ASCII || entry.count < 1) return null;
  // Short strings (up to 4 bytes) are stored inline in the value field.
  const at = entry.count <= 4 ? entry.valueAt : tiff + view.getUint32(entry.valueAt, little);
  return String.fromCharCode(view.getUint8(at)).toUpperCase();
}

function readRationals(
  view: DataView,
  tiff: number,
  ifd: number,
  tag: number,
  little: boolean,
): [number, number, number] | null {
  const entry = findTag(view, ifd, tag, little);
  if (!entry || entry.type !== TYPE_RATIONAL || entry.count < 3) return null;
  const at = tiff + view.getUint32(entry.valueAt, little);
  const parts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const numerator = view.getUint32(at + i * 8, little);
    const denominator = view.getUint32(at + i * 8 + 4, little);
    parts.push(denominator === 0 ? NaN : numerator / denominator);
  }
  return [parts[0] ?? NaN, parts[1] ?? NaN, parts[2] ?? NaN];
}

function toDecimal([degrees, minutes, seconds]: [number, number, number]): number {
  return degrees + minutes / 60 + seconds / 3600;
}
