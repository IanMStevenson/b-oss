// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { isStoreNoticeOffered } from '../store-notice.js';

const base = { windowsStore: false, platform: 'win32' as const, disabled: false, dismissed: false };

describe('isStoreNoticeOffered', () => {
  it('is offered on a Windows GitHub-installer build', () => {
    expect(isStoreNoticeOffered(base)).toBe(true);
  });
  it('is never offered in the Store build', () => {
    expect(isStoreNoticeOffered({ ...base, windowsStore: true })).toBe(false);
  });
  it('is not offered off Windows', () => {
    expect(isStoreNoticeOffered({ ...base, platform: 'linux' })).toBe(false);
    expect(isStoreNoticeOffered({ ...base, platform: 'darwin' })).toBe(false);
  });
  it('is hidden once dismissed this session', () => {
    expect(isStoreNoticeOffered({ ...base, dismissed: true })).toBe(false);
  });
  it("is hidden after Don't show again", () => {
    expect(isStoreNoticeOffered({ ...base, disabled: true })).toBe(false);
  });
});
