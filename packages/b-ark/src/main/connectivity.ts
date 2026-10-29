// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// "Is this machine online at all?" — asked only after a Blipfoto request failed at the transport
// level, to tell "you seem to be offline" from "Blipfoto isn't answering" (b-oss#488). Same probe as
// b-mobile: a DNS-over-HTTPS query to Cloudflare's resolver by IP address, so no DNS is needed to
// reach it. Any HTTP answer proves a connection; only a failure or timeout means offline.

import type { NetworkFailure } from '@b-oss/b-ark-ui-components';

export const CONNECTIVITY_PROBE_URL = 'https://1.1.1.1/dns-query?name=cloudflare.com&type=A';
export const CONNECTIVITY_TIMEOUT_MS = 4000;

export async function isOnline(): Promise<boolean> {
  try {
    await fetch(CONNECTIVITY_PROBE_URL, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(CONNECTIVITY_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

/** Why a transport failure happened: no connection at all, or Blipfoto not answering. */
export async function diagnoseNetworkFailure(): Promise<NetworkFailure> {
  return (await isOnline()) ? 'blipfoto' : 'offline';
}
