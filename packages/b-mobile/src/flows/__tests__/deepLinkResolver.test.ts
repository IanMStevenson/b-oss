// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// app-architecture.md §16 — the one resolver for the OAuth redirect (never routed),
// bmobile://entry|user content links, and the opt-in blipfoto.com web link. Pure logic (§19
// layer 1), covering both `resolveDeepLink` (URL -> target) and `routeDeepLink` (target -> the
// actual push call) separately, matching the split the module itself makes.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDeepLink, routeDeepLink } from '../deepLinkResolver.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveDeepLink', () => {
  it('recognises the default OAuth redirect prefix and never routes it', () => {
    expect(resolveDeepLink('bmobile://oauth/?access_token=abc&state=xyz')).toEqual({
      kind: 'oauth',
    });
  });

  it('reads the redirect prefix from VITE_OAUTH_REDIRECT_URI, not a hardcoded value', () => {
    vi.stubEnv('VITE_OAUTH_REDIRECT_URI', 'testapp://auth/');
    expect(resolveDeepLink('testapp://auth/?access_token=abc')).toEqual({ kind: 'oauth' });
    // The real default prefix no longer matches once a different one is configured — falls
    // through to ordinary bmobile:// host parsing instead, where "oauth" isn't entry/user.
    expect(resolveDeepLink('bmobile://oauth/?access_token=abc')).toEqual({ kind: 'ignore' });
  });

  it('resolves bmobile://entry/:id to an entry target', () => {
    expect(resolveDeepLink('bmobile://entry/12345')).toEqual({
      kind: 'entry',
      entryId: '12345',
    });
  });

  it('resolves bmobile://user/:username to a profile target', () => {
    expect(resolveDeepLink('bmobile://user/alice')).toEqual({
      kind: 'profile',
      username: 'alice',
    });
  });

  it('decodes a percent-encoded segment', () => {
    expect(resolveDeepLink('bmobile://user/ali%20ce')).toEqual({
      kind: 'profile',
      username: 'ali ce',
    });
  });

  it('ignores an unrecognised bmobile:// host', () => {
    expect(resolveDeepLink('bmobile://unknown/thing')).toEqual({ kind: 'ignore' });
  });

  it('ignores bmobile:// with no path segment', () => {
    expect(resolveDeepLink('bmobile://entry/')).toEqual({ kind: 'ignore' });
  });

  it('resolves a blipfoto.com entry web link', () => {
    expect(resolveDeepLink('https://www.blipfoto.com/entry/999')).toEqual({
      kind: 'entry',
      entryId: '999',
    });
  });

  it('resolves a blipfoto.com profile web link (single path segment)', () => {
    expect(resolveDeepLink('https://www.blipfoto.com/bob')).toEqual({
      kind: 'profile',
      username: 'bob',
    });
  });

  it('resolves the hardcoded follow-requests path to follow-request', () => {
    expect(resolveDeepLink('https://www.blipfoto.com/me/followers/requests')).toEqual({
      kind: 'follow-request',
    });
  });

  it('resolves blipfoto.com with no scheme prefix (bare hostname) too', () => {
    expect(resolveDeepLink('https://blipfoto.com/bob')).toEqual({
      kind: 'profile',
      username: 'bob',
    });
  });

  it('ignores a reserved bare segment with nothing after it (e.g. just "entry")', () => {
    expect(resolveDeepLink('https://www.blipfoto.com/entry')).toEqual({ kind: 'ignore' });
  });

  it('ignores an unrelated external URL', () => {
    expect(resolveDeepLink('https://example.com/whatever')).toEqual({ kind: 'ignore' });
  });

  it('ignores a malformed URL string rather than throwing', () => {
    expect(resolveDeepLink('not a url at all')).toEqual({ kind: 'ignore' });
  });
});

describe('routeDeepLink', () => {
  it('routes an entry target to /entry/:id', () => {
    const push = vi.fn();
    routeDeepLink({ kind: 'entry', entryId: '42' }, push);
    expect(push).toHaveBeenCalledWith('/entry/42');
  });

  it('routes a profile target to /user/:username', () => {
    const push = vi.fn();
    routeDeepLink({ kind: 'profile', username: 'alice' }, push);
    expect(push).toHaveBeenCalledWith('/user/alice');
  });

  it('routes a follow-request target to /me/requests', () => {
    const push = vi.fn();
    routeDeepLink({ kind: 'follow-request' }, push);
    expect(push).toHaveBeenCalledWith('/me/requests');
  });

  it('never routes an oauth target', () => {
    const push = vi.fn();
    routeDeepLink({ kind: 'oauth' }, push);
    expect(push).not.toHaveBeenCalled();
  });

  it('never routes an ignore target', () => {
    const push = vi.fn();
    routeDeepLink({ kind: 'ignore' }, push);
    expect(push).not.toHaveBeenCalled();
  });
});
