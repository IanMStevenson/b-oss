// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Which API base URL the client is built with, per platform (capabilities().api.access): the real
// host where the HTTP layer can reach it, the page's own origin where the host proxies it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformKind } from '../../platform/platformKind.js';

let kind: PlatformKind = 'android';
vi.mock('../../platform/platformKind.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/platformKind.js')>()),
  platformKind: () => kind,
}));

const bases: string[] = [];
vi.mock('@b-oss/b-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@b-oss/b-api')>();
  return {
    ...actual,
    BlipfotoClient: vi.fn().mockImplementation(function (
      this: unknown,
      _token: string,
      base: string,
    ) {
      bases.push(base);
    }),
  };
});
vi.mock('../../platform/http.js', () => ({ platformFetch: vi.fn() }));
vi.mock('../../platform/upload.js', () => ({ getMultipartImpl: () => undefined }));
vi.mock('../../platform/secureStorage.js', () => ({ getToken: vi.fn() }));
vi.mock('../../state/authReady.js', () => ({ authReady: Promise.resolve() }));
vi.mock('../../state/accountsStore.js', () => ({
  useAccountsStore: { getState: () => ({ accounts: [], activeAccountId: null }) },
}));

const { getClientForToken } = await import('../client.js');

beforeEach(() => {
  bases.length = 0;
  vi.stubGlobal('window', { location: { origin: 'app://b-mobile' } });
});

describe('API base URL', () => {
  it('android: the real API host', () => {
    kind = 'android';
    getClientForToken('t');
    expect(bases).toEqual(['https://api.blipfoto.com/4/']);
  });

  it('desktop: the app origin, where the shell proxies the API', () => {
    kind = 'desktop';
    getClientForToken('t');
    expect(bases).toEqual(['app://b-mobile/api/blipfoto/4/']);
  });

  it('a browser under the dev server: the page origin, where vite proxies the API', () => {
    kind = 'web';
    getClientForToken('t');
    expect(bases).toEqual(['app://b-mobile/api/blipfoto/4/']);
  });
});
