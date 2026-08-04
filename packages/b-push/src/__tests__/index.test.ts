// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The router itself (src/index.ts) — path/method dispatch and HttpError -> status-code mapping.
// The route handlers it delegates to are mocked here (they have their own, thorough tests in
// registrations.test.ts) so this file only exercises the routing/error-translation glue.

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRegistration: vi.fn(),
  patchRegistration: vi.fn(),
  refreshPreferences: vi.fn(),
  getRegistrationStatus: vi.fn(),
  deleteRegistrationHandler: vi.fn(),
}));

vi.mock('../routes/registrations.js', async () => {
  const actual = await vi.importActual<typeof import('../routes/registrations.js')>(
    '../routes/registrations.js',
  );
  return { ...actual, ...mocks };
});
vi.mock('../poll.js', () => ({ runActivityPoll: vi.fn().mockResolvedValue({}) }));
vi.mock('../prefsRefresh.js', () => ({ runPrefsRefresh: vi.fn().mockResolvedValue({}) }));

const worker = await import('../index.js');
const { HttpError } = await import('../routes/registrations.js');

function testEnv() {
  return {
    DB: {} as never,
    READ_TOKEN_ENCRYPTION_KEY: '',
    REGISTRATION_SECRET: '',
    FCM_SERVICE_ACCOUNT_JSON: '',
  };
}

describe('fetch router', () => {
  it('routes POST /v1/registrations to createRegistration and returns 201', async () => {
    mocks.createRegistration.mockResolvedValue({ registrationId: 'r1', registrationSecret: 's1' });
    const request = new Request('https://example.com/v1/registrations', {
      method: 'POST',
      body: JSON.stringify({
        blipfotoUserId: 'u',
        readToken: 'rt',
        deviceToken: 'dt',
        platform: 'android',
      }),
    });
    const response = await worker.default.fetch(request, testEnv());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ registrationId: 'r1', registrationSecret: 's1' });
  });

  it('routes PATCH /v1/registrations/:id to patchRegistration and returns 204', async () => {
    mocks.patchRegistration.mockResolvedValue(undefined);
    const request = new Request('https://example.com/v1/registrations/r1', {
      method: 'PATCH',
      body: JSON.stringify({ pollIntervalMinutes: 10 }),
    });
    const response = await worker.default.fetch(request, testEnv());
    expect(response.status).toBe(204);
    expect(mocks.patchRegistration).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'r1',
      null,
      { pollIntervalMinutes: 10 },
    );
  });

  it('routes GET /v1/registrations/:id to getRegistrationStatus', async () => {
    mocks.getRegistrationStatus.mockResolvedValue({ status: 'active', lastPolledAt: 1 });
    const request = new Request('https://example.com/v1/registrations/r1', { method: 'GET' });
    const response = await worker.default.fetch(request, testEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'active', lastPolledAt: 1 });
  });

  it('routes DELETE /v1/registrations/:id to deleteRegistrationHandler', async () => {
    mocks.deleteRegistrationHandler.mockResolvedValue(undefined);
    const request = new Request('https://example.com/v1/registrations/r1', { method: 'DELETE' });
    const response = await worker.default.fetch(request, testEnv());
    expect(response.status).toBe(204);
  });

  it('routes POST /v1/registrations/:id/refresh-preferences to refreshPreferences', async () => {
    mocks.refreshPreferences.mockResolvedValue(undefined);
    const request = new Request('https://example.com/v1/registrations/r1/refresh-preferences', {
      method: 'POST',
    });
    const response = await worker.default.fetch(request, testEnv());
    expect(response.status).toBe(204);
  });

  it('returns 404 for an unknown path', async () => {
    const request = new Request('https://example.com/v1/nope', { method: 'GET' });
    const response = await worker.default.fetch(request, testEnv());
    expect(response.status).toBe(404);
  });

  it('translates a thrown HttpError into its own status code', async () => {
    mocks.getRegistrationStatus.mockRejectedValue(new HttpError(404, 'No such registration'));
    const request = new Request('https://example.com/v1/registrations/missing', { method: 'GET' });
    const response = await worker.default.fetch(request, testEnv());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No such registration' });
  });

  it('translates an unexpected thrown error into a 500', async () => {
    mocks.getRegistrationStatus.mockRejectedValue(new Error('boom'));
    const request = new Request('https://example.com/v1/registrations/r1', { method: 'GET' });
    const response = await worker.default.fetch(request, testEnv());
    expect(response.status).toBe(500);
  });
});

describe('scheduled handler', () => {
  it('runs the hourly prefs refresh only for the hourly cron pattern', async () => {
    const { runPrefsRefresh } = await import('../prefsRefresh.js');
    const { runActivityPoll } = await import('../poll.js');
    await worker.default.scheduled({ cron: '0 * * * *' } as never, testEnv());
    expect(runPrefsRefresh).toHaveBeenCalledTimes(1);
    expect(runActivityPoll).not.toHaveBeenCalled();
  });

  it('runs the activity poll for every other cron pattern', async () => {
    const { runActivityPoll } = await import('../poll.js');
    vi.mocked(runActivityPoll).mockClear();
    await worker.default.scheduled({ cron: '1-minute-pattern' } as never, testEnv());
    expect(runActivityPoll).toHaveBeenCalledTimes(1);
  });
});
