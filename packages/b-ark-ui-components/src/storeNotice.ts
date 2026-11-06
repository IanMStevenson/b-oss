// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { AppStore } from './backend.js';

/** b-ark's Microsoft Store listing. */
export const STORE_URL = 'https://apps.microsoft.com/detail/9P736ZD76DC5';
/** The site's page explaining the move. */
export const STORE_HOW_IT_WORKS_URL = 'https://b-oss.dev/b-ark';

/** Wording for the launch notice shown to GitHub-installer users, pointing them to the Store. */
export const STORE_NOTICE_TEXT =
  'b-ark is now on the Microsoft Store. Switch to get updates automatically from the Store. Uninstall this version in Windows Settings > Apps, then install b-ark from the Store; your accounts, settings and backups carry over.';

/**
 * Whether to show the Store notice now. The main process decides if it is on offer (non-Store
 * build, not dismissed, not switched off). On top of that it yields to anything more important:
 * the stale-backup notice, and any account whose last backup needs attention (amber or red).
 */
export function shouldShowStoreNotice(
  store: Pick<AppStore, 'storeMigrationNotice' | 'staleBackupNotice' | 'accounts'>,
): boolean {
  if (store.storeMigrationNotice !== true) return false;
  if (store.staleBackupNotice) return false;
  return !store.accounts.some((a) => a.rag_state === 'red' || a.rag_state === 'amber');
}
