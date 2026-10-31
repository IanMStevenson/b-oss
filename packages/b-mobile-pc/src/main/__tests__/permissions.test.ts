// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { APP_ORIGIN } from '../app-protocol.js';
import { allowPermission, isPermissionGranted } from '../permissions.js';

const own = `${APP_ORIGIN}/#/compose`;

describe('allowPermission: camera (b-oss#670)', () => {
  it('grants video-only media to the app origin', () => {
    expect(
      allowPermission({ permission: 'media', requestingUrl: own, mediaTypes: ['video'] }),
    ).toBe(true);
  });

  it('denies microphone, or camera plus microphone, or no detail', () => {
    for (const mediaTypes of [['audio'], ['video', 'audio'], [], undefined]) {
      expect(allowPermission({ permission: 'media', requestingUrl: own, mediaTypes })).toBe(false);
    }
  });

  it('denies other origins, including look-alikes', () => {
    for (const requestingUrl of [
      'https://example.com/',
      `${APP_ORIGIN}.evil.example/`,
      `${APP_ORIGIN}x/`,
      undefined,
    ]) {
      expect(allowPermission({ permission: 'media', requestingUrl, mediaTypes: ['video'] })).toBe(
        false,
      );
    }
  });
});

describe('allowPermission: location (b-oss#672)', () => {
  it('grants geolocation to the app origin only', () => {
    expect(isPermissionGranted('geolocation', `${APP_ORIGIN}/browse`)).toBe(true);
    expect(isPermissionGranted('geolocation', 'https://evil.example/')).toBe(false);
    expect(isPermissionGranted('geolocation', `${APP_ORIGIN}.evil.example/`)).toBe(false);
    expect(isPermissionGranted('geolocation', '')).toBe(false);
  });
});

describe('everything else stays denied', () => {
  it.each(['notifications', 'clipboard-read', 'midi', 'openExternal', 'fullscreen'])(
    'denies %s',
    (permission) => {
      expect(allowPermission({ permission, requestingUrl: own, mediaTypes: undefined })).toBe(
        false,
      );
      expect(isPermissionGranted(permission, `${APP_ORIGIN}/`)).toBe(false);
    },
  );

  it('never grants media through the name-only helper (no way to check it is video-only)', () => {
    expect(isPermissionGranted('media', `${APP_ORIGIN}/`)).toBe(false);
  });
});
