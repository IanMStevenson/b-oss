// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The capability table is what screens and flows read instead of asking "which platform?", so each
// platform's row is pinned here. android and web must reproduce what the old isNativePlatform()
// checks did; desktop and ios are design intent (b-oss#607, b-oss#608).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformKind } from '../platformKind.js';

let kind: PlatformKind = 'web';
vi.mock('../platformKind.js', () => ({ platformKind: () => kind }));

import { capabilities } from '../capabilities.js';

beforeEach(() => {
  kind = 'web';
});

describe('capabilities', () => {
  it('android: talks to the API directly, may use either sign-in browser, notifications by push', () => {
    kind = 'android';
    expect(capabilities()).toEqual({
      api: { access: 'direct' },
      auth: { embeddedAvailable: true, userCanChooseBrowser: true },
      notifications: { mechanism: 'push' },
      location: 'os',
      media: { capture: 'camera' },
    });
  });

  it('desktop: same-origin API proxy, embedded sign-in is the only way, notifications by polling', () => {
    kind = 'desktop';
    expect(capabilities()).toEqual({
      api: { access: 'same-origin-proxy' },
      auth: { embeddedAvailable: true, userCanChooseBrowser: false },
      notifications: { mechanism: 'polling' },
      location: 'pick-only',
      media: { capture: 'files-only' },
    });
  });

  it('ios: APNs push, direct API, embedded sign-in available', () => {
    kind = 'ios';
    const caps = capabilities();
    expect(caps.notifications.mechanism).toBe('push');
    expect(caps.api.access).toBe('direct');
    expect(caps.auth.embeddedAvailable).toBe(true);
    expect(caps.location).toBe('os');
    expect(caps.media.capture).toBe('camera');
  });

  it('web under the dev server: the API is proxied; there is no embedded sign-in or push', () => {
    kind = 'web';
    // Vitest runs with import.meta.env.DEV = true, like `vite dev`.
    expect(import.meta.env.DEV).toBe(true);
    expect(capabilities()).toEqual({
      api: { access: 'same-origin-proxy' },
      auth: { embeddedAvailable: false, userCanChooseBrowser: false },
      notifications: { mechanism: 'none' },
      location: 'os',
      media: { capture: 'camera' },
    });
  });

  it('a platform never both forces embedded sign-in and offers the choice', () => {
    for (const k of ['android', 'ios', 'desktop', 'web'] as const) {
      kind = k;
      const { auth } = capabilities();
      expect(auth.userCanChooseBrowser && !auth.embeddedAvailable).toBe(false);
    }
  });
});

describe('desktop location at run time (b-oss#672)', () => {
  it('shows the control until a first attempt fails, and is `os` only after a success', async () => {
    const m = await import('../capabilities.js');
    kind = 'desktop';
    m.recordDesktopLocationOutcome('untried');
    expect(m.capabilities().location).toBe('pick-only');
    expect(m.locationControlAvailable()).toBe(true);
    m.recordDesktopLocationOutcome('failed');
    expect(m.locationControlAvailable()).toBe(false);
    m.recordDesktopLocationOutcome('ok');
    expect(m.capabilities().location).toBe('os');
    expect(m.locationControlAvailable()).toBe(true);
    m.recordDesktopLocationOutcome('untried');
  });

  it('android, ios and web are unaffected by the outcome', async () => {
    const m = await import('../capabilities.js');
    m.recordDesktopLocationOutcome('failed');
    for (const k of ['android', 'web', 'ios'] as const) {
      kind = k;
      expect(m.capabilities().location).toBe('os');
      expect(m.locationControlAvailable()).toBe(true);
    }
    m.recordDesktopLocationOutcome('untried');
  });
});
