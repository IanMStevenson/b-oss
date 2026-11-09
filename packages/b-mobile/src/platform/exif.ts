// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Reads the GPS position (b-oss#740) and the date taken (b-oss#989) embedded in a JPEG's EXIF block.
// Needed on desktop, where the picker is a plain file input that returns no metadata, and on the web
// fallback; Android's native PhotoPick plugin reads the same fields itself. Pure bytes-in, values-out,
// so it works whatever supplies the bytes. Only the first APP1/Exif segment is read, and any
// malformed input yields nulls rather than throwing.

export interface ExifPosition {
  lat: number;
  lon: number;
}

const TAG_GPS_IFD = 0x8825;
const TAG_EXIF_IFD = 0x8769;
// Date tags in priority order: when the shutter fired, when it was digitised, when last modified.
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TAG_DATE_TIME = 0x0132;
const TAG_LAT_REF = 1;
const TAG_LAT = 2;
const TAG_LON_REF = 3;
const TAG_LON = 4;
const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;

export interface ExifData {
  /** The embedded GPS position, or null when absent or zeroed. */
  gps: ExifPosition | null;
  /** The calendar date taken as written, 'YYYY-MM-DD' (EXIF carries no time zone), or null. */
  date: string | null;
}

const NONE: ExifData = { gps: null, date: null };

/** What a JPEG's EXIF holds; both fields are null when absent, unreadable or not a JPEG. */
export function readExif(bytes: Uint8Array): ExifData {
  try {
    return parse(bytes);
  } catch {
    return NONE;
  }
}

function parse(bytes: Uint8Array): ExifData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return NONE;

  // Walk the marker segments to the Exif APP1 block.
  let pos = 2;
  let tiff = -1;
  while (pos + 4 <= view.byteLength) {
    if (view.getUint8(pos) !== 0xff) return NONE;
    const marker = view.getUint8(pos + 1);
    if (marker === 0xda || marker === 0xd9) break; // image data / end: no Exif before it
    const length = view.getUint16(pos + 2);
    if (marker === 0xe1 && length >= 8 && view.getUint32(pos + 4) === 0x45786966) {
      tiff = pos + 10; // after "Exif\0\0"
      break;
    }
    pos += 2 + length;
  }
  if (tiff < 0) return NONE;

  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return NONE;
  const little = order === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 42) return NONE;

  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  return { gps: readGps(view, tiff, ifd0, little), date: readDate(view, tiff, ifd0, little) };
}

function readGps(view: DataView, tiff: number, ifd0: number, little: boolean): ExifPosition | null {
  const gpsIfd = findEntry(view, ifd0, little, TAG_GPS_IFD);
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

/** The first usable date by priority: DateTimeOriginal, DateTimeDigitized (both in the Exif
 * sub-IFD), then DateTime (IFD0). A tag that is present but unparseable (e.g. the all-zero
 * placeholder some cameras write) falls through to the next. */
function readDate(view: DataView, tiff: number, ifd0: number, little: boolean): string | null {
  const exifPtr = findEntry(view, ifd0, little, TAG_EXIF_IFD);
  const exifIfd = exifPtr ? tiff + view.getUint32(exifPtr.valueAt, little) : -1;
  const sources: Array<[number, number]> = [
    [exifIfd, TAG_DATE_TIME_ORIGINAL],
    [exifIfd, TAG_DATE_TIME_DIGITIZED],
    [ifd0, TAG_DATE_TIME],
  ];
  for (const [ifd, tag] of sources) {
    if (ifd < 0) continue;
    const date = readDateTag(view, tiff, ifd, little, tag);
    if (date) return date;
  }
  return null;
}

function readDateTag(
  view: DataView,
  tiff: number,
  ifd: number,
  little: boolean,
  tag: number,
): string | null {
  const e = findEntry(view, ifd, little, tag);
  if (!e || e.type !== TYPE_ASCII || e.count < 10) return null;
  const at = e.count > 4 ? tiff + view.getUint32(e.valueAt, little) : e.valueAt;
  let text = '';
  for (let i = 0; i < 10; i++) text += String.fromCharCode(view.getUint8(at + i));
  const m = /^(\d{4}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Reject placeholders ("0000:00:00") and impossible dates (e.g. 02-31).
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (
    y < 1 ||
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
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
