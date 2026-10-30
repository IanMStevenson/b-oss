// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The desktop branches of the two platform modules that have one: secure storage and the embedded
// sign-in. With the shell's bridge present they must use it and never touch the Capacitor plugins.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pluginGet, pluginSet, pluginRemove, pluginOpen } = vi.hoisted(() => ({
  pluginGet: vi.fn(),
  pluginSet: vi.fn(),
  pluginRemove: vi.fn(),
  pluginOpen: vi.fn(),
}));
vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: { getItem: pluginGet, setItem: pluginSet, removeItem: pluginRemove },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: () => ({ open: pluginOpen }),
}));

const bridge = {
  version: 1,
  secure: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  openAuth: vi.fn(),
};

import {
  deleteRegistrationSecret,
  deleteToken,
  getRegistrationSecret,
  getToken,
  setRegistrationSecret,
  setToken,
} from '../secureStorage.js';
import {
  EmbeddedAuthCancelledError,
  EmbeddedAuthUnavailableError,
  openEmbeddedAuth,
} from '../embeddedAuth.js';

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('secureStorage on desktop', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { bMobileDesktop: bridge });
  });

  it('reads, writes and deletes tokens through the bridge with the usual key scheme', async () => {
    bridge.secure.get.mockResolvedValue('tok');
    expect(await getToken('alice', 'app')).toBe('tok');
    expect(bridge.secure.get).toHaveBeenCalledWith('token:alice:app');

    await setToken('alice', 'service', 'svc');
    expect(bridge.secure.set).toHaveBeenCalledWith('token:alice:service', 'svc');

    await deleteToken('alice', 'app');
    expect(bridge.secure.remove).toHaveBeenCalledWith('token:alice:app');
  });

  it('does the same for push registration secrets', async () => {
    bridge.secure.get.mockResolvedValue(null);
    expect(await getRegistrationSecret('alice')).toBeNull();
    await setRegistrationSecret('alice', 's');
    await deleteRegistrationSecret('alice');
    expect(bridge.secure.get).toHaveBeenCalledWith('push-registration-secret:alice');
    expect(bridge.secure.set).toHaveBeenCalledWith('push-registration-secret:alice', 's');
    expect(bridge.secure.remove).toHaveBeenCalledWith('push-registration-secret:alice');
  });

  it('never touches the Capacitor plugin', async () => {
    bridge.secure.get.mockResolvedValue(null);
    await getToken('a', 'app');
    await setToken('a', 'app', 't');
    await deleteToken('a', 'app');
    expect(pluginGet).not.toHaveBeenCalled();
    expect(pluginSet).not.toHaveBeenCalled();
    expect(pluginRemove).not.toHaveBeenCalled();
  });

  it('lets a refusal from the shell (no OS encryption) propagate instead of falling back', async () => {
    bridge.secure.set.mockRejectedValue(new Error('Secure storage is not available'));
    await expect(setToken('a', 'app', 't')).rejects.toThrow('not available');
    expect(pluginSet).not.toHaveBeenCalled();
  });
});

describe('secureStorage without the bridge', () => {
  it('still uses the Capacitor plugin', async () => {
    pluginGet.mockResolvedValue('from-plugin');
    expect(await getToken('alice', 'app')).toBe('from-plugin');
    expect(pluginGet).toHaveBeenCalledWith('token:alice:app');
  });
});

describe('openEmbeddedAuth on desktop', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { bMobileDesktop: bridge });
  });

  it('opens the shell window and returns the captured redirect URL', async () => {
    bridge.openAuth.mockResolvedValue('bmobile://oauth/#access_token=t&state=s');
    expect(
      await openEmbeddedAuth('https://www.blipfoto.com/oauth/authorize', 'bmobile://oauth/'),
    ).toBe('bmobile://oauth/#access_token=t&state=s');
    expect(bridge.openAuth).toHaveBeenCalledWith(
      'https://www.blipfoto.com/oauth/authorize',
      'bmobile://oauth/',
    );
    expect(pluginOpen).not.toHaveBeenCalled();
  });

  it('maps the window being closed to EmbeddedAuthCancelledError', async () => {
    bridge.openAuth.mockRejectedValue(new Error('cancelled'));
    await expect(openEmbeddedAuth('https://x/', 'bmobile://oauth/')).rejects.toBeInstanceOf(
      EmbeddedAuthCancelledError,
    );
  });

  it('passes other failures through', async () => {
    bridge.openAuth.mockRejectedValue(new Error('Sign-in URL is not on an allowed host'));
    await expect(openEmbeddedAuth('https://x/', 'bmobile://oauth/')).rejects.toThrow(
      'allowed host',
    );
  });
});

describe('openEmbeddedAuth in a plain browser', () => {
  it('is still unavailable', async () => {
    await expect(openEmbeddedAuth('https://x/', 'bmobile://oauth/')).rejects.toBeInstanceOf(
      EmbeddedAuthUnavailableError,
    );
  });
});
