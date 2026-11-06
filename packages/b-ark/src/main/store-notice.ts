// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export interface StoreNoticeInput {
  /** process.windowsStore === true: the Microsoft Store build, which the Store updates itself. */
  windowsStore: boolean;
  platform: NodeJS.Platform;
  /** "Don't show again" was chosen (machine-local). */
  disabled: boolean;
  /** Dismissed this session. */
  dismissed: boolean;
}

/**
 * Whether to offer the "b-ark is now on the Microsoft Store" notice: Windows builds that are not
 * the Store build, unless dismissed or switched off. Pure, so it is testable off Windows.
 */
export function isStoreNoticeOffered(input: StoreNoticeInput): boolean {
  if (input.platform !== 'win32') return false;
  if (input.windowsStore) return false;
  return !input.disabled && !input.dismissed;
}
