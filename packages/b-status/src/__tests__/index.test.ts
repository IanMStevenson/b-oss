// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The Worker entry point's plain-HTTP guard (b-oss#595). Everything past the guard has its own
// tests (serve.test.ts, shares.test.ts); here only that http: is refused before any of it runs.

import { describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../types.js';

function untouchedEnv() {
  const touched = vi.fn();
  const DB = new Proxy({}, { get: (_t, prop) => (touched(String(prop)), undefined) });
  return { env: { DB } as unknown as Env, touched };
}

const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

describe('plain HTTP is refused', () => {
  it('http GET -> 301 to the same path and query on https', async () => {
    const { env, touched } = untouchedEnv();
    const res = await worker.fetch(new Request('http://b-status.test/v1/status?x=1'), env, ctx);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://b-status.test/v1/status?x=1');
    expect(touched).not.toHaveBeenCalled();
  });

  it('http POST -> 403 and nothing is processed', async () => {
    const { env, touched } = untouchedEnv();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await worker.fetch(
      new Request('http://b-status.test/v1/shares', { method: 'POST', body: '{"turnstile":"t"}' }),
      env,
      ctx,
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('HTTPS required\n');
    expect(res.headers.get('location')).toBeNull();
    expect(touched).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('https is unaffected (unknown path still reaches the router -> 404)', async () => {
    const { env } = untouchedEnv();
    const res = await worker.fetch(new Request('https://b-status.test/nope'), env, ctx);
    expect(res.status).toBe(404);
  });
});
