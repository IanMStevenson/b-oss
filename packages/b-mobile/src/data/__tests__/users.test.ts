// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — error-codes.md is explicit that SCR-18 must read codes 101 (malformed username)
// and 103 (user unavailable) identically as "no such user", rather than 101 falling through to a
// generic error. fetchUserProfile is the one place that rewrite happens.

import { describe, it, expect, vi } from 'vitest';
import { BlipfotoError } from '@b-oss/b-api';
import { fetchUserProfile } from '../users.js';
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
