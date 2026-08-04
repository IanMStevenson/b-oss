// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Direct unit tests for platformFetch's native path (§19 layer 1) — unlike most platform/*.ts
// modules, this one is exercised directly rather than only through a mocked consumer, because
// RESUME.md flagged it as a real, previously-unimplemented gap: everything b-api/data/pushService
// send through it is read back as `response.text()`, so the CapacitorHttp round-trip (data →
// Response.text(), headers → a real Headers instance, status → Response.ok) is exactly the logic
// most likely to be got subtly wrong.

import { afterEach, describe, expect, it, vi } from 'vitest';

interface NativeHttpResponse {
  data: string;
  status: number;
  headers: Record<string, string>;
}

const requestMock = vi.fn<(options: Record<string, unknown>) => Promise<NativeHttpResponse>>();
let isNative = true;

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative },
  CapacitorHttp: { request: (options: Record<string, unknown>) => requestMock(options) },
}));

afterEach(() => {
  vi.restoreAllMocks();
  requestMock.mockReset();
  isNative = true;
});

describe('platformFetch — native path', () => {
  it('forwards method, headers and a form-urlencoded body, forcing responseType text', async () => {
    const { platformFetch } = await import('../http.js');
    requestMock.mockResolvedValue({ data: '{"ok":true}', status: 200, headers: {} });

    const body = new URLSearchParams({ foo: 'bar' });
    await platformFetch('https://api.blipfoto.com/4/entry.json', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    expect(requestMock).toHaveBeenCalledWith({
      url: 'https://api.blipfoto.com/4/entry.json',
      method: 'POST',
      headers: { authorization: 'Bearer t', 'content-type': 'application/x-www-form-urlencoded' },
      data: body.toString(),
      responseType: 'text',
    });
  });

  it('defaults to GET with no body when init is omitted', async () => {
    const { platformFetch } = await import('../http.js');
    requestMock.mockResolvedValue({ data: '{}', status: 200, headers: {} });

    await platformFetch('https://api.blipfoto.com/4/user.json');

    expect(requestMock).toHaveBeenCalledWith({
      url: 'https://api.blipfoto.com/4/user.json',
      method: 'GET',
      headers: {},
      data: undefined,
      responseType: 'text',
    });
  });

  it("returns a real Response whose text()/status/ok/headers match CapacitorHttp's result", async () => {
    const { platformFetch } = await import('../http.js');
    requestMock.mockResolvedValue({
      data: '{"data":{"id":"1"},"error":null}',
      status: 200,
      headers: { 'X-RateLimit-Remaining': '42' },
    });

    const response = await platformFetch('https://api.blipfoto.com/4/user.json');

    expect(response).toBeInstanceOf(Response);
    expect(response.headers).toBeInstanceOf(Headers);
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('42');
    await expect(response.text()).resolves.toBe('{"data":{"id":"1"},"error":null}');
  });

  it('surfaces a non-2xx status via Response.ok rather than throwing', async () => {
    const { platformFetch } = await import('../http.js');
    requestMock.mockResolvedValue({ data: 'nope', status: 404, headers: {} });

    const response = await platformFetch('https://api.blipfoto.com/4/user.json');

    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  it('falls through to plain fetch on web', async () => {
    isNative = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const { platformFetch } = await import('../http.js');

    await platformFetch('https://api.blipfoto.com/4/user.json');

    expect(fetchSpy).toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
