// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// base64 <-> bytes helpers shared by platform/upload.ts (§7's hand-built multipart body needs to
// move between @capacitor/filesystem's base64 file contents and raw bytes it can concatenate).
// Pure logic, no Capacitor dependency — kept out of platform/upload.ts so it's directly
// unit-testable the same way platform/mapTiles.ts's pure half is (§19 layer 1).

/** Chunked to avoid `String.fromCharCode(...bytes)` blowing the engine's max-arguments limit on
 * a large (multi-MB) photo — 0x8000 is the standard safe chunk size for this pattern. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
