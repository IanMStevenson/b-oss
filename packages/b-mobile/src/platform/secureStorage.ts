// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @aparajita/capacitor-secure-storage (Android Keystore / iOS Keychain — falls back to
// localStorage in a desktop browser, adequate for dev since there are no real secrets there). In
// the desktop shell (platform/desktop.ts) the secrets live in the OS keystore instead, behind the
// shell's bridge, which refuses to store anything if real encryption is unavailable.
// Key scheme: `token:<accountId>:<purpose>` — one entry per (account, purpose), so each
// token stays attached to the account and purpose it was obtained for (§8). This is the
// only module that may touch it — tokens must never reach a Zustand store, React state, prefs,
// or a log line.

import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { desktopBridge } from './desktop.js';

export type TokenPurpose = 'app' | 'service';

// The only three operations anywhere in this module; the desktop shell, when present, takes the
// place of the Capacitor plugin for all of them.
function getSecret(key: string): Promise<string | null> {
  const desktop = desktopBridge();
  return desktop ? desktop.secure.get(key) : SecureStorage.getItem(key);
}

async function setSecret(key: string, value: string): Promise<void> {
  const desktop = desktopBridge();
  if (desktop) await desktop.secure.set(key, value);
  else await SecureStorage.setItem(key, value);
}

async function removeSecret(key: string): Promise<void> {
  const desktop = desktopBridge();
  if (desktop) await desktop.secure.remove(key);
  else await SecureStorage.removeItem(key);
}

function tokenKey(accountId: string, purpose: TokenPurpose): string {
  return `token:${accountId}:${purpose}`;
}

export async function getToken(accountId: string, purpose: TokenPurpose): Promise<string | null> {
  return getSecret(tokenKey(accountId, purpose));
}

export async function setToken(
  accountId: string,
  purpose: TokenPurpose,
  token: string,
): Promise<void> {
  await setSecret(tokenKey(accountId, purpose), token);
}

export async function deleteToken(accountId: string, purpose: TokenPurpose): Promise<void> {
  await removeSecret(tokenKey(accountId, purpose));
}

// The per-registration bearer secret b-push's POST /v1/registrations returns (b-push
// ARCHITECTURE.md) (distinct from either Blipfoto token above — it authenticates the app to
// *b-push*, never to Blipfoto itself). Same secure-storage treatment: never a Zustand store, React
// state, prefs, or log line. One secret per account, since an account has at most one live
// registration at a time.
function registrationSecretKey(accountId: string): string {
  return `push-registration-secret:${accountId}`;
}

export async function getRegistrationSecret(accountId: string): Promise<string | null> {
  return getSecret(registrationSecretKey(accountId));
}

export async function setRegistrationSecret(accountId: string, secret: string): Promise<void> {
  await setSecret(registrationSecretKey(accountId), secret);
}

export async function deleteRegistrationSecret(accountId: string): Promise<void> {
  await removeSecret(registrationSecretKey(accountId));
}
