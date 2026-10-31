// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { APP_ORIGIN } from '../app-protocol.js';
import { allowPermission } from '../permissions.js';

const own = `${APP_ORIGIN}/#/compose`;

describe('allowPermission', () => {
  it('grants video-only media to the app origin', () => {
    expect(
      allowPermission({ permission: 'media', requestingUrl: own, mediaTypes: ['video'] }),
    ).toBe(true);
  });

  it('denies microphone, or camera plus microphone', () => {
    expect(
      allowPermission({ permission: 'media', requestingUrl: own, mediaTypes: ['audio'] }),
    ).toBe(false);
    expect(
      allowPermission({ permission: 'media', requestingUrl: own, mediaTypes: ['video', 'audio'] }),
    ).toBe(false);
    expect(allowPermission({ permission: 'media', requestingUrl: own, mediaTypes: [] })).toBe(
      false,
    );
    expect(
      allowPermission({ permission: 'media', requestingUrl: own, mediaTypes: undefined }),
    ).toBe(false);
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

  it('denies everything else, location included', () => {
    for (const permission of [
      'geolocation',
      'notifications',
      'clipboard-read',
      'midi',
      'openExternal',
    ]) {
      expect(allowPermission({ permission, requestingUrl: own, mediaTypes: undefined })).toBe(
        false,
      );
    }
  });
});
