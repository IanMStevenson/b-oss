// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach } from 'vitest';
import { fetchAuthorAvatar, clearAuthorAvatarCache } from '../users.js';
import { vi } from 'vitest';

const calls: string[] = [];
let respond: (username: string) => Promise<{ user: { avatar_url: string } }> = () =>
  Promise.reject(new Error('unset'));

vi.mock('../client.js', () => ({
  getClient: () =>
    Promise.resolve({
      // A plain function, not vi.fn(): Vitest's spy tracking makes a rejecting mock look like an
      // unhandled rejection even when the code under test handles it.
      getUserProfile: (opts: { username: string }) => {
        calls.push(opts.username);
        return respond(opts.username);
      },
    }),
}));

beforeEach(() => {
  clearAuthorAvatarCache();
  calls.length = 0;
  respond = () => Promise.reject(new Error('unset'));
});

describe('fetchAuthorAvatar', () => {
  it('returns the author’s avatar URL', async () => {
    respond = () => Promise.resolve({ user: { avatar_url: 'https://cdn.example/a.jpg' } });
    expect(await fetchAuthorAvatar('alice')).toBe('https://cdn.example/a.jpg');
    expect(calls).toEqual(['alice']);
  });

  it('returns null for an author with no avatar', async () => {
    respond = () => Promise.resolve({ user: { avatar_url: '' } });
    expect(await fetchAuthorAvatar('alice')).toBeNull();
  });

  it('asks once per author — repeated and concurrent callers share one request', async () => {
    respond = () => Promise.resolve({ user: { avatar_url: 'u' } });
    await Promise.all([fetchAuthorAvatar('alice'), fetchAuthorAvatar('alice')]);
    await fetchAuthorAvatar('alice');
    await fetchAuthorAvatar('bob');
    expect(calls).toEqual(['alice', 'bob']);
  });

  it('does not cache a failure, so the next entry retries', async () => {
    respond = () => Promise.reject(new Error('offline'));
    await expect(fetchAuthorAvatar('alice')).rejects.toThrow('offline');
    respond = () => Promise.resolve({ user: { avatar_url: 'ok' } });
    expect(await fetchAuthorAvatar('alice')).toBe('ok');
    expect(calls).toEqual(['alice', 'alice']);
  });
});
