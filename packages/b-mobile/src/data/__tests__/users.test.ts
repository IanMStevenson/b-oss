// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — SCR-18 must read codes 101 (malformed username)
// and 103 (user unavailable) identically as "no such user", rather than 101 falling through to a
// generic error. fetchUserProfile is the one place that rewrite happens.

import { describe, it, expect, vi } from 'vitest';
import { BlipfotoError } from '@b-oss/b-api';
import { fetchUserProfile, fetchJournalProtected, clearJournalProtectedCache } from '../users.js';
import { t } from '../../strings/index.js';

const client = { getUserProfile: vi.fn() };

vi.mock('../client.js', () => ({
  getClient: () => Promise.resolve(client),
}));

describe('fetchUserProfile', () => {
  it('rewrites a 101 (malformed username) failure to the "not found" message', async () => {
    client.getUserProfile.mockRejectedValue(new BlipfotoError(101, 'invalid username'));
    await expect(fetchUserProfile('bad name')).rejects.toThrow(t('SCR-18.error.not_found'));
  });

  it('rewrites a 103 (user unavailable) failure to the same "not found" message', async () => {
    client.getUserProfile.mockRejectedValue(new BlipfotoError(103, 'user unavailable'));
    await expect(fetchUserProfile('ghost')).rejects.toThrow(t('SCR-18.error.not_found'));
  });

  it('leaves any other failure untouched', async () => {
    client.getUserProfile.mockRejectedValue(new BlipfotoError(500, 'server exploded'));
    await expect(fetchUserProfile('someone')).rejects.toThrow('server exploded');
  });
});

describe('fetchJournalProtected', () => {
  const details = { privacy: 1 };

  it('reads protection from details.privacy when the journal is visible', async () => {
    clearJournalProtectedCache();
    client.getUserProfile.mockResolvedValue({ visibility: 1, details });
    await expect(fetchJournalProtected('alice')).resolves.toBe(true);
    expect(client.getUserProfile).toHaveBeenCalledWith({ username: 'alice', returnDetails: true });
  });

  it('treats visibility 0 as protected even though details come back empty', async () => {
    clearJournalProtectedCache();
    client.getUserProfile.mockResolvedValue({ visibility: 0, details: null });
    await expect(fetchJournalProtected('bob')).resolves.toBe(true);
  });

  it('caches per author, and retries after a failure', async () => {
    clearJournalProtectedCache();
    client.getUserProfile.mockReset();
    client.getUserProfile.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchJournalProtected('carol')).rejects.toThrow('offline');
    client.getUserProfile.mockResolvedValue({ visibility: 1, details: { privacy: 0 } });
    await expect(fetchJournalProtected('carol')).resolves.toBe(false);
    await fetchJournalProtected('carol');
    expect(client.getUserProfile).toHaveBeenCalledTimes(2);
  });
});
