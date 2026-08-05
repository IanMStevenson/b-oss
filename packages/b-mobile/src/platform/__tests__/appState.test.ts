// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Phase 12.4's resume hook — direct test, same reasoning as platform/deepLinks.test.ts.
// onAppStateChange is the thing AppShell.tsx wires to re-run pushFlow.ts's launch backstop check
// on resume (rules.md's "re-check the permission when the app resumes").

import { afterEach, describe, expect, it, vi } from 'vitest';

let isNative = true;
const addListener = vi
  .fn<
    (
      event: string,
      handler: (state: { isActive: boolean }) => void,
    ) => Promise<{ remove: () => void }>
  >()
  .mockResolvedValue({ remove: vi.fn() });

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (event: string, handler: (state: { isActive: boolean }) => void) =>
      addListener(event, handler),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  isNative = true;
});

describe('onAppStateChange', () => {
  it('is a no-op on web, never touching the native plugin', async () => {
    isNative = false;
    const { onAppStateChange } = await import('../appState.js');
    const handler = vi.fn();
    const off = onAppStateChange(handler);
    expect(addListener).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });

  it('registers the native appStateChange listener', async () => {
    const { onAppStateChange } = await import('../appState.js');
    const handler = vi.fn();
    onAppStateChange(handler);
    await Promise.resolve();
    expect(addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));
  });

  it('calls the handler with isActive on a state change event', async () => {
    const { onAppStateChange } = await import('../appState.js');
    const handler = vi.fn();
    onAppStateChange(handler);
    await Promise.resolve();
    const registered = addListener.mock.calls[0][1];
    registered({ isActive: true });
    expect(handler).toHaveBeenCalledWith(true);
    registered({ isActive: false });
    expect(handler).toHaveBeenCalledWith(false);
  });

  it('removes the listener when the returned unsubscribe is called', async () => {
    const remove = vi.fn();
    addListener.mockResolvedValueOnce({ remove });
    const { onAppStateChange } = await import('../appState.js');
    const off = onAppStateChange(vi.fn());
    await Promise.resolve();
    off();
    expect(remove).toHaveBeenCalled();
  });
});
