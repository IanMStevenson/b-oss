// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from './testDb.js';
import { insertRegistration, getRegistrationById } from '../db.js';
import { runPrefsRefresh } from '../prefsRefresh.js';
import { importEncryptionKey, encryptReadToken } from '../crypto.js';
import type { Env, RegistrationRow } from '../types.js';

function testKeyBase64(): string {
  const bytes = new Uint8Array(32).fill(6);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function testEnv(): Env {
  return {
    DB: undefined as never,
    READ_TOKEN_ENCRYPTION_KEY: testKeyBase64(),
    REGISTRATION_SECRET: '',
    FCM_SERVICE_ACCOUNT_JSON: '{}',
  };
}

let db: TestDb;
let env: Env;

async function seedRow(id: string, overrides: Partial<RegistrationRow> = {}): Promise<void> {
  const key = await importEncryptionKey(env.READ_TOKEN_ENCRYPTION_KEY);
  const { ciphertext, nonce } = await encryptReadToken('a-real-read-token', key);
  await insertRegistration(db, {
    id,
    secret_hash: 'hash',
    blipfoto_user_id: 'gbradley',
    read_token_ciphertext: ciphertext,
    read_token_nonce: nonce,
    device_token: 'device-1',
    platform: 'android',
    poll_interval_minutes: 5,
    last_polled_at: 0,
    last_seen_comments_total: 0,
    last_seen_notifications_total: 0,
    cached_push_prefs: null,
    prefs_fetched_at: null,
    status: 'active',
    created_at: 0,
    ...overrides,
  });
}

beforeEach(() => {
  db = createTestDb();
  env = testEnv();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

function envelope(data: unknown): string {
  return JSON.stringify({ data, error: null });
}

describe('runPrefsRefresh', () => {
  it('refreshes cached_push_prefs for every active registration', async () => {
    await seedRow('reg-1');
    await seedRow('reg-2');
    // One registration per fetch call — each needs its own Response instance (a body can only
    // be read once), so a factory rather than a single reused Response.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(envelope({ push: { configured: 1, settings: {} } }), { status: 200 }),
      ),
    );

    const summary = await runPrefsRefresh(db, env, () => 42_000);
    expect(summary).toEqual({ refreshed: 2, skippedReadTokenInvalid: 0, errors: 0 });

    const row1 = await getRegistrationById(db, 'reg-1');
    expect(row1?.cached_push_prefs).toBe('{"configured":true}');
    expect(row1?.prefs_fetched_at).toBe(42_000);
  });

  it('skips a read-token-invalid registration entirely (never included in the sweep)', async () => {
    await seedRow('reg-1', { status: 'read-token-invalid' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const summary = await runPrefsRefresh(db, env, () => 1000);
    expect(summary).toEqual({ refreshed: 0, skippedReadTokenInvalid: 0, errors: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('on a dead token: does not flip status and does not send any push — leaves it for the activity poll', async () => {
    await seedRow('reg-1');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: null, error: { code: 51, message: 'bad token' } }), {
        status: 200,
      }),
    );
    const summary = await runPrefsRefresh(db, env, () => 1000);
    expect(summary).toEqual({ refreshed: 0, skippedReadTokenInvalid: 1, errors: 0 });

    const row = await getRegistrationById(db, 'reg-1');
    expect(row?.status).toBe('active'); // untouched — the activity poll owns this transition
  });

  it("one registration's failure does not abort the rest of the sweep", async () => {
    await seedRow('reg-1');
    await seedRow('reg-2');
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call++;
      if (call === 1) return Promise.reject(new Error('transient failure'));
      return Promise.resolve(
        new Response(envelope({ push: { configured: 1, settings: {} } }), { status: 200 }),
      );
    });
    const summary = await runPrefsRefresh(db, env, () => 1000);
    expect(summary.errors).toBe(1);
    expect(summary.refreshed).toBe(1);
  });
});
