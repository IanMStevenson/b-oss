// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { APP_ORIGIN } from '../app-protocol.js';
import { isPermissionGranted } from '../permissions.js';

describe('isPermissionGranted', () => {
  it('grants geolocation to the app origin only', () => {
    expect(isPermissionGranted('geolocation', `${APP_ORIGIN}/browse`)).toBe(true);
    expect(isPermissionGranted('geolocation', 'https://evil.example/')).toBe(false);
    expect(isPermissionGranted('geolocation', `${APP_ORIGIN}.evil.example/`)).toBe(false);
    expect(isPermissionGranted('geolocation', '')).toBe(false);
  });

  it.each(['media', 'notifications', 'clipboard-read', 'midi', 'openExternal', 'fullscreen'])(
    'still denies %s',
    (permission) => {
      expect(isPermissionGranted(permission, `${APP_ORIGIN}/`)).toBe(false);
    },
  );
});
