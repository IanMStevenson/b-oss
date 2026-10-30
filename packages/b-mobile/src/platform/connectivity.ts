// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// "Is the phone online at all?" — asked only after a Blipfoto request failed at the transport level,
// to tell "you seem to be offline" from "Blipfoto isn't answering" (b-oss#539). A WebView can't do a
// raw DNS lookup, so this is a DNS-over-HTTPS query to Cloudflare's resolver by IP address (no DNS
// needed to reach it), through the native HTTP layer. Any HTTP answer at all proves a connection;
// only a failure or timeout means offline. On web (vite dev) the browser's own flag is used instead,
// since a cross-origin probe from the page would be blocked by CORS and misreport as offline.

import { platformFetch } from './http.js';
import { isCapacitorNative } from './platformKind.js';

export const CONNECTIVITY_PROBE_URL = 'https://1.1.1.1/dns-query?name=cloudflare.com&type=A';
export const CONNECTIVITY_TIMEOUT_MS = 4000;

export async function isOnline(): Promise<boolean> {
  if (!isCapacitorNative()) return navigator.onLine;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      platformFetch(CONNECTIVITY_PROBE_URL, { headers: { accept: 'application/dns-json' } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CONNECTIVITY_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
