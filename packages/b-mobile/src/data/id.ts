// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A small random-id generator shared by anything that needs a local, client-generated
// identifier (upload queue items, multipart boundaries, temp file names) — built on
// crypto.getRandomValues rather than crypto.randomUUID(), matching flows/oauthRound.ts's
// generateState() precedent, since randomUUID()'s availability on older Android WebViews is
// less certain than getRandomValues (universally supported).

export function randomId(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
