// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformKind } from '../platformKind.js';

let kind: PlatformKind = 'android';
vi.mock('../platformKind.js', () => ({ platformKind: () => kind }));
const isolation = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ isolation }),
}));

import { capabilities } from '../capabilities.js';
import { initSiteSession } from '../siteSession.js';

beforeEach(() => {
  kind = 'android';
  isolation.mockReset();
});

describe('initSiteSession', () => {
  it('records per-account when the native host says its WebView has profiles', async () => {
    isolation.mockResolvedValue({ isolation: 'per-account' });
    await initSiteSession();
    expect(capabilities().site.session).toBe('per-account');
  });

  it('records single when it does not', async () => {
    isolation.mockResolvedValue({ isolation: 'single' });
    await initSiteSession();
    expect(capabilities().site.session).toBe('single');
  });

  it('keeps the safe default (and never throws) when an older shell has no such call', async () => {
    isolation.mockResolvedValue({ isolation: 'single' });
    await initSiteSession();
    isolation.mockRejectedValue(new Error('not implemented'));
    await expect(initSiteSession()).resolves.toBeUndefined();
    expect(capabilities().site.session).toBe('single');
  });

  it('asks nothing of a desktop or browser host', async () => {
    kind = 'desktop';
    await initSiteSession();
    kind = 'web';
    await initSiteSession();
    expect(isolation).not.toHaveBeenCalled();
  });
});
