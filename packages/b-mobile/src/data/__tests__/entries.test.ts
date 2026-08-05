// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — fetchEntry's 104/202 error rewriting (SCR-06.error.protected/.unavailable) is
// exactly the kind of "got subtly wrong" logic worth its own direct test: useResource/
// useLiveEntry show whatever `Error.message` this throws verbatim, with no mapApiError step of
// their own, so a wrong message here reaches the screen unfiltered.

import { describe, it, expect, vi } from 'vitest';
import { BlipfotoError } from '@b-oss/b-api';
import { fetchEntry } from '../entries.js';
import { t } from '../../strings/index.js';

const client = { getEntry: vi.fn() };

vi.mock('../client.js', () => ({
  getClient: () => Promise.resolve(client),
}));

describe('fetchEntry', () => {
  it('rewrites a 104 (protected) failure to the SCR-06 copy-deck message', async () => {
    client.getEntry.mockRejectedValue(new BlipfotoError(104, 'not visible'));
    await expect(fetchEntry('e1')).rejects.toThrow(t('SCR-06.error.protected'));
  });

  it('rewrites a 202 (entry unavailable) failure to the SCR-06 copy-deck message', async () => {
    client.getEntry.mockRejectedValue(new BlipfotoError(202, 'gone'));
    await expect(fetchEntry('e1')).rejects.toThrow(t('SCR-06.error.unavailable'));
  });

  it('leaves any other failure untouched', async () => {
    client.getEntry.mockRejectedValue(new BlipfotoError(500, 'server exploded'));
    await expect(fetchEntry('e1')).rejects.toThrow('server exploded');
  });

  it('leaves a non-BlipfotoError untouched', async () => {
    client.getEntry.mockRejectedValue(new Error('network down'));
    await expect(fetchEntry('e1')).rejects.toThrow('network down');
  });
});
