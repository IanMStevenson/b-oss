// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The handheld row is what android, ios and web have always had; these literals are copied from
// before the profile existed, so a changed handheld default fails here (b-oss#634).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformKind } from '../../platform/platformKind.js';

let kind: PlatformKind = 'web';
vi.mock('../../platform/platformKind.js', () => ({ platformKind: () => kind }));

import { PROFILES, profile, profileKindFor } from '../profile.js';

beforeEach(() => {
  kind = 'web';
});

describe('profile', () => {
  it('handheld defaults deep-equal the pre-profile devicePrefsStore defaults', () => {
    expect(PROFILES.handheld.prefs).toEqual({
      confirmAccountBeforeReaction: true,
      reminders: {},
      uploadFullSize: true,
      openBlipfotoLinksInApp: false,
      notificationPollingIntervalMinutes: 5,
      seenFirstRunExplainer: false,
      showZoomBar: true,
      showPagination: true,
      thumbnailMargins: 'none',
      thumbnailZoomPercent: 100,
      photoFit: 'full-width',
      accountAvatarStyle: 'picture',
      theme: 'system',
    });
  });

  it('handheld grid base tile is the 86px EntryGrid used before', () => {
    expect(PROFILES.handheld.grid.baseTilePx).toBe(86);
  });

  it('android, ios and web are handheld; the desktop shell is desktop', () => {
    expect(profileKindFor('android')).toBe('handheld');
    expect(profileKindFor('ios')).toBe('handheld');
    expect(profileKindFor('web')).toBe('handheld');
    expect(profileKindFor('desktop')).toBe('desktop');
  });

  it('profile() follows the platform', () => {
    kind = 'android';
    expect(profile().kind).toBe('handheld');
    kind = 'desktop';
    expect(profile().kind).toBe('desktop');
  });
});
