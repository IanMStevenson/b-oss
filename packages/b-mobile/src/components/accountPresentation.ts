// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// How an account's mode and "needs sign-in" state read, shared by every surface that lists
// accounts (switcher, Accounts screen, drawer).

import type { StoredAccount } from '../state/accountsStore.js';
import { t } from '../strings/index.js';

/** Red + bold, for a status that needs the user to act (b-oss#263). */
export const NEEDS_SIGN_IN_STYLE = {
  color: 'var(--ion-color-danger)',
  fontWeight: 700,
} as const;

export function modeLabel(account: StoredAccount): string {
  if (account.appTokenScope === null) return t('SCR-30.status.needs_sign_in');
  return account.appTokenScope === 'read,write' ? 'Read-write' : 'Read-only';
}

/** The pale-green whole-row highlight for the active account — one definition shared by the header
 * switcher and the Accounts screen so the two read the same (b-oss#306). */
export const ACTIVE_ACCOUNT_BACKGROUND = 'var(--green-100, #eef2ee)';
