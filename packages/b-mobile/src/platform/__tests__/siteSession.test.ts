// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformKind } from '../platformKind.js';

let kind: PlatformKind = 'android';
vi.mock('../platformKind.js', () => ({ platformKind: () => kind }));
const isolation = vi.hoisted(() => vi.fn());
const discardAllPending = vi.hoisted(() => vi.fn());
const adoptPending = vi.hoisted(() => vi.fn());
const discardPending = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ isolation, discardAllPending, adoptPending, discardPending }),
}));

import { capabilities } from '../capabilities.js';
import {
  initSiteSession,
  newSiteSessionToken,
  siteAdoptPending,
  siteDiscardPending,
} from '../siteSession.js';

beforeEach(() => {
  kind = 'android';
  isolation.mockReset();
  discardAllPending.mockReset().mockResolvedValue(undefined);
  adoptPending.mockReset().mockResolvedValue(undefined);
  discardPending.mockReset().mockResolvedValue(undefined);
});

describe('the website login a sign-in round leaves (b-oss#1064)', () => {
  it('makes tokens that are hex, long enough for the hosts, and different each time', () => {
    const a = newSiteSessionToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newSiteSessionToken()).not.toBe(a);
  });

  it('hands the token and account to the native host to adopt, or the token to discard', async () => {
    await siteAdoptPending('aa11bb22cc33dd44', 'bob');
    expect(adoptPending).toHaveBeenCalledWith({ token: 'aa11bb22cc33dd44', accountId: 'bob' });
    await siteDiscardPending('aa11bb22cc33dd44');
    expect(discardPending).toHaveBeenCalledWith({ token: 'aa11bb22cc33dd44' });
  });

  it('never throws when the host cannot (an older native shell)', async () => {
    adoptPending.mockRejectedValue(new Error('not implemented'));
    discardPending.mockRejectedValue(new Error('not implemented'));
    await expect(siteAdoptPending('aa11bb22cc33dd44', 'bob')).resolves.toBeUndefined();
    await expect(siteDiscardPending('aa11bb22cc33dd44')).resolves.toBeUndefined();
  });

  it('start-up sweeps rounds that were interrupted', async () => {
    isolation.mockResolvedValue({ isolation: 'per-account' });
    await initSiteSession();
    expect(discardAllPending).toHaveBeenCalledTimes(1);
  });
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
