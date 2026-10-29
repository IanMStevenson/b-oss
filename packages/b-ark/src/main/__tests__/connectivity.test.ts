// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, afterEach } from 'vitest';
import { diagnoseNetworkFailure, CONNECTIVITY_PROBE_URL } from '../connectivity.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('diagnoseNetworkFailure', () => {
  it('says Blipfoto is not answering when the probe gets any response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    expect(await diagnoseNetworkFailure()).toBe('blipfoto');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CONNECTIVITY_PROBE_URL);
  });

  it('says offline when the probe fails or times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await diagnoseNetworkFailure()).toBe('offline');
  });
});
