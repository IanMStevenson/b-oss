// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Fixtures: a fake `fetch` keyed by URL prefix, and a ready-made healthy site/API.

import type { ProbeConfig, FetchLike } from '../checks.js';

export const CFG: ProbeConfig = {
  siteBase: 'https://site.test',
  apiBase: 'https://api.test/4',
  clientId: 'monitor-client',
  userAgent: 'test-agent',
  timeoutMs: 1000,
  slowMs: 500,
};

export interface Stub {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  throws?: Error;
}

export const BROWSE = '<a href="/entry/123456789">x</a>';
export const ENTRY =
  '<title>A day</title><meta property="og:image" content="https://img.test/p.jpg">';
export const API_RECENT = JSON.stringify({
  version: '4',
  error: null,
  data: { entries: [{ entry_id_str: '987654321' }] },
});
export const API_ENTRY = JSON.stringify({
  version: '4',
  error: null,
  data: { entry: { entry_id_str: '987654321' } },
});

export function healthy(): Record<string, Stub> {
  return {
    'https://site.test/browse': { body: BROWSE },
    'https://site.test/entry/123456789': { body: ENTRY },
    'https://img.test/p.jpg': { headers: { 'content-type': 'image/jpeg' } },
    'https://api.test/4/entries/recent': { body: API_RECENT },
    'https://api.test/4/entry': { body: API_ENTRY },
  };
}

/** A fetch answering from `stubs` (matched on the URL without its query string). */
export function fakeFetch(stubs: Record<string, Stub>, calls: string[] = []): FetchLike {
  return (input) => {
    calls.push(input);
    const key = input.split('?')[0] ?? input;
    const stub = stubs[key];
    if (!stub) return Promise.resolve(new Response('not found', { status: 404 }));
    if (stub.throws) return Promise.reject(stub.throws);
    return Promise.resolve(
      new Response(stub.body ?? '', { status: stub.status ?? 200, headers: stub.headers }),
    );
  };
}
