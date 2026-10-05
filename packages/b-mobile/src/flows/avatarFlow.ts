// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Keeps each stored account's profile picture (`StoredAccount.avatarUrl`) in step with Blipfoto.
// Sign-in only ever learns the username, so until something fetched the picture the account
// switcher and header indicator had nothing but the generic icon to show (device feedback
// 2026-10-05) — the only thing that set it was opening Settings → Profile. Each account's own app
// token is used, not the active account's, so one pass fills in all of them.
//
// Best-effort and silent: a missing token, offline phone or API error just leaves the picture as
// it was — the icon fallback is always valid.

import { getToken } from '../platform/secureStorage.js';
import { getClientForToken } from '../data/client.js';
import { useAccountsStore } from '../state/accountsStore.js';

export async function refreshAccountAvatar(accountId: string): Promise<void> {
  try {
    const account = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
    if (!account) return;
    const token = await getToken(account.id, 'app');
    if (!token) return;
    const res = await getClientForToken(token).getUserProfile({ username: account.username });
    const avatarUrl = res.user.avatar_url || null;
    if (avatarUrl !== account.avatarUrl) {
      useAccountsStore.getState().updateAccount(account.id, { avatarUrl });
    }
  } catch {
    // Leave the stored value alone.
  }
}

export async function refreshAccountAvatars(): Promise<void> {
  const ids = useAccountsStore.getState().accounts.map((a) => a.id);
  await Promise.all(ids.map((id) => refreshAccountAvatar(id)));
}
