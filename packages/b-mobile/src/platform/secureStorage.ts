// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @aparajita/capacitor-secure-storage (Android Keystore / iOS Keychain). Key scheme:
// `token:<accountId>:<purpose>` — one entry per (account, purpose), matching auth.md's "each
// attached to the account and purpose it was obtained for" (app-architecture.md §8).
// TODO(Phase 2): implement against @aparajita/capacitor-secure-storage. This is the only module
// that may touch it — tokens must never reach a Zustand store, React state, prefs, or a log line.

export type TokenPurpose = 'app' | 'service';

export function getToken(_accountId: string, _purpose: TokenPurpose): Promise<string | null> {
  return Promise.resolve(null);
}

export function setToken(
  _accountId: string,
  _purpose: TokenPurpose,
  _token: string,
): Promise<void> {
  return Promise.reject(new Error('platform/secureStorage.ts: not implemented until Phase 2'));
}

export function deleteToken(_accountId: string, _purpose: TokenPurpose): Promise<void> {
  return Promise.reject(new Error('platform/secureStorage.ts: not implemented until Phase 2'));
}
