// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, vi } from 'vitest';

const platformFetch = vi.fn<(...args: unknown[]) => Promise<Response>>();
vi.mock('../../platform/http.js', () => ({
  platformFetch: (...args: unknown[]) => platformFetch(...args),
}));

const {
  createRegistration,
  patchRegistration,
  refreshPreferences,
  getRegistrationStatus,
  deleteRegistration,
  PushServiceError,
} = await import('../pushService.js');

beforeEach(() => {
  vi.clearAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('createRegistration', () => {
  it('POSTs with the shared registration secret and the body, returns the parsed result', async () => {
    platformFetch.mockResolvedValue(
      jsonResponse({ registrationId: 'r1', registrationSecret: 's1' }, 201),
    );
    const result = await createRegistration({
      blipfotoUserId: 'gbradley',
      readToken: 'rt',
      deviceToken: 'dt',
      platform: 'android',
    });
    expect(result).toEqual({ registrationId: 'r1', registrationSecret: 's1' });

    const [url, init] = platformFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/registrations');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
    expect(JSON.parse(init.body as string)).toMatchObject({ blipfotoUserId: 'gbradley' });
  });

  it('throws PushServiceError with the server-supplied message on a non-2xx response', async () => {
    platformFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid registration secret' }), { status: 401 }),
    );
    await expect(
      createRegistration({
        blipfotoUserId: 'gbradley',
        readToken: 'rt',
        deviceToken: 'dt',
        platform: 'android',
      }),
    ).rejects.toMatchObject({ status: 401, message: 'Invalid registration secret' });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    platformFetch.mockResolvedValue(new Response('gateway timeout', { status: 504 }));
    await expect(
      createRegistration({
        blipfotoUserId: 'gbradley',
        readToken: 'rt',
        deviceToken: 'dt',
        platform: 'android',
      }),
    ).rejects.toBeInstanceOf(PushServiceError);
  });
});

describe('patchRegistration', () => {
  it('PATCHes with the per-registration bearer secret', async () => {
    platformFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await patchRegistration('r1', 'per-reg-secret', { pollIntervalMinutes: 10 });
    const [url, init] = platformFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/registrations/r1');
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer per-reg-secret');
  });

  it('resolves with no value on 204', async () => {
    platformFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(patchRegistration('r1', 's', {})).resolves.toBeUndefined();
  });
});

describe('refreshPreferences', () => {
  it('POSTs to the refresh-preferences sub-path', async () => {
    platformFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await refreshPreferences('r1', 'per-reg-secret');
    const [url, init] = platformFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/registrations/r1/refresh-preferences');
    expect(init.method).toBe('POST');
  });
});

describe('getRegistrationStatus', () => {
  it('GETs and returns the parsed status', async () => {
    platformFetch.mockResolvedValue(jsonResponse({ status: 'active', lastPolledAt: 123 }));
    const result = await getRegistrationStatus('r1', 'sec');
    expect(result).toEqual({ status: 'active', lastPolledAt: 123 });
    const [, init] = platformFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method ?? 'GET').toBe('GET');
  });
});

describe('deleteRegistration', () => {
  it('DELETEs with the bearer secret', async () => {
    platformFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteRegistration('r1', 'sec');
    const [url, init] = platformFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/registrations/r1');
    expect(init.method).toBe('DELETE');
  });
});
