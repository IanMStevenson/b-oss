// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Is this file a *complete* image? (b-oss#185.) A download can "succeed" and still leave a file
// that is cut short or half-written: the WebView then renders the part that arrived and fills the
// rest with grey/black/green blocks — the "green jaggies" — and, being cached, it stays that way.
// Every image format has a structural end marker, so a truncated file is detectable from its last
// few bytes without decoding it.
//
// Deliberately strict: anything we can't positively recognise as complete is reported as not OK.
// The cost of a false "bad" is only that the image isn't cached (it's shown straight from the
// network instead); the cost of a false "good" is the corrupt image this exists to prevent.

export type ImageIntegrity =
  { ok: true; format: 'jpeg' | 'png' | 'gif' | 'webp' } | { ok: false; reason: string };

const bad = (reason: string): ImageIntegrity => ({ ok: false, reason });

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

export function checkImageIntegrity(bytes: Uint8Array): ImageIntegrity {
  const n = bytes.length;
  if (n === 0) return bad('empty file');

  // JPEG: starts FF D8, must end with the End-Of-Image marker FF D9 (some encoders pad with
  // trailing zero bytes, which is harmless).
  if (startsWith(bytes, [0xff, 0xd8])) {
    let end = n - 1;
    while (end > 0 && bytes[end] === 0x00) end--;
    return bytes[end] === 0xd9 && bytes[end - 1] === 0xff
      ? { ok: true, format: 'jpeg' }
      : bad('jpeg truncated (no end-of-image marker)');
  }

  // PNG: 8-byte signature; the last chunk is IEND (length 0, type 'IEND', 4-byte CRC) = 12 bytes.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    const iend = [0x49, 0x45, 0x4e, 0x44]; // 'IEND'
    return n >= 12 && iend.every((b, i) => bytes[n - 8 + i] === b)
      ? { ok: true, format: 'png' }
      : bad('png truncated (no IEND chunk)');
  }

  // GIF: 'GIF8…' and a 0x3B trailer.
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return bytes[n - 1] === 0x3b ? { ok: true, format: 'gif' } : bad('gif truncated (no trailer)');
  }

  // WebP: RIFF container whose declared size (+8 for the header) must fit within the file.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    n >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45
  ) {
    const declared = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    return n >= declared + 8
      ? { ok: true, format: 'webp' }
      : bad('webp truncated (short of declared size)');
  }

  return bad('not a recognised image (or an error page rather than an image)');
}
