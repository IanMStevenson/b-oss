// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps CapacitorHttp in a fetch-shaped function for b-api's transport seam (§7). Required on
// device regardless of preference: Blipfoto serves no CORS headers, so a WebView fetch() to
// api.blipfoto.com is blocked. On web (vite dev / desktop browser), plain fetch works via the
// dev-only proxy configured in vite.config.ts.
//
// Every caller in this app (data/client.ts's b-api requests, data/pushService.ts's b-push
// registration calls) only ever reads the result as text — `response.text()`, then its own
// JSON.parse — never `.json()`/`.blob()`/`.arrayBuffer()`. `responseType: 'text'` is requested
// below to keep that contract, but CapacitorHttp's Android implementation ignores it whenever the
// response's Content-Type is `application/json` (see HttpRequestHandler.readData's "backward
// compatibility" branch in @capacitor/android) and hands back an already-parsed object instead —
// nativeFetch() re-serializes that case back to a string so `response.text()` always yields text.
//
// `init.body` is always `undefined`, a `URLSearchParams` (b-api's form-urlencoded mutate()), or
// an already-`JSON.stringify`'d string (data/pushService.ts) — `String(body)` handles both
// non-undefined cases identically to what a real `fetch()` would send, since
// `URLSearchParams.prototype.toString()` is exactly the form-urlencoded serialization.
// `FormData`/`Blob` bodies are deliberately never routed through here — that's b-api's separate
// multipart seam (`platform/upload.ts`, via `@capacitor/file-transfer`), because CapacitorHttp
// mishandles `FormData` (see platform/upload.ts's own header comment).

import { Capacitor, CapacitorHttp } from '@capacitor/core';

function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function toUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url;
  return String(input);
}

// Every real caller (data/client.ts, data/pushService.ts) only ever passes `undefined`, a
// `URLSearchParams` (b-api's form-urlencoded mutate()), or an already-JSON.stringify'd `string`
// (data/pushService.ts) — never FormData/Blob/ArrayBuffer, which go through the separate
// multipart seam instead. Checked explicitly, rather than a blanket `String(body)`, both to
// satisfy @typescript-eslint/no-base-to-string and because a body type this function doesn't
// know how to serialize losing data silently would be a worse failure than throwing.
function toBody(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string' || body instanceof URLSearchParams) return body.toString();
  throw new Error(
    `platform/http.ts: unsupported request body type for platformFetch (${Object.prototype.toString.call(body)}) — multipart bodies must go through platform/upload.ts instead`,
  );
}

async function nativeFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const result = await CapacitorHttp.request({
    url: toUrl(input),
    method: init?.method ?? 'GET',
    headers: toHeaderRecord(init?.headers),
    data: toBody(init?.body),
    responseType: 'text',
  });
  // CapacitorHttp's `data` is typed `any`. Despite `responseType: 'text'` above, Android hands
  // back a parsed object rather than a string for `application/json` responses (see header
  // comment) — re-stringify in that case so `response.text()` always yields the raw JSON text.
  const data = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
  // A real Response is constructed (rather than a hand-rolled duck-typed object) so
  // `response.headers instanceof Headers` holds for b-api's updateRateLimit() and every other
  // Response method callers might reasonably use continues to behave exactly like web fetch().
  return new Response(data, { status: result.status, headers: result.headers });
}

export const platformFetch: typeof fetch = (input, init) => {
  if (Capacitor.isNativePlatform()) {
    return nativeFetch(input, init);
  }
  return fetch(input, init);
};
