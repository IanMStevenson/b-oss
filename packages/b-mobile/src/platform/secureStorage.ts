// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @aparajita/capacitor-secure-storage (Android Keystore / iOS Keychain — falls back to
// localStorage in a desktop browser, adequate for dev since there are no real secrets there).
// Key scheme: `token:<accountId>:<purpose>` — one entry per (account, purpose), matching
// auth.md's "each attached to the account and purpose it was obtained for" (§8). This is the
// only module that may touch it — tokens must never reach a Zustand store, React state, prefs,
// or a log line.

import { SecureStorage } from '@aparajita/capacitor-secure-storage';

export type TokenPurpose = 'app' | 'service';

function tokenKey(accountId: string, purpose: TokenPurpose): string {
  return `token:${accountId}:${purpose}`;
}

export async function getToken(accountId: string, purpose: TokenPurpose): Promise<string | null> {
  return SecureStorage.getItem(tokenKey(accountId, purpose));
}

export async function setToken(
  accountId: string,
  purpose: TokenPurpose,
  token: string,
): Promise<void> {
  await SecureStorage.setItem(tokenKey(accountId, purpose), token);
}

export async function deleteToken(accountId: string, purpose: TokenPurpose): Promise<void> {
  await SecureStorage.removeItem(tokenKey(accountId, purpose));
}
