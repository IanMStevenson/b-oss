// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// "Is this machine online at all?" — asked only after a Blipfoto request failed at the transport
// level, to tell "you seem to be offline" from "Blipfoto isn't answering" (b-oss#488). Mirrors
// b-mobile's probe: a DNS-over-HTTPS query to Cloudflare's resolver by IP address (no DNS needed to
// reach it). `no-cors` means the response is opaque and needs neither CORS nor a host permission;
// getting any response proves a connection, and only a failure or timeout means offline.

import type { NetworkFailure } from '@b-oss/b-ark-ui-components';

export const CONNECTIVITY_PROBE_URL = 'https://1.1.1.1/dns-query?name=cloudflare.com&type=A';
export const CONNECTIVITY_TIMEOUT_MS = 4000;

export async function isOnline(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
  try {
    await fetch(CONNECTIVITY_PROBE_URL, { mode: 'no-cors', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Why a transport failure happened: no connection at all, or Blipfoto not answering. */
export async function diagnoseNetworkFailure(): Promise<NetworkFailure> {
  return (await isOnline()) ? 'blipfoto' : 'offline';
}
