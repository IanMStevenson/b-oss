// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Stored accounts, the active account, and token-possession state (§6). Token possession is
// state, not a storage detail — the tokens themselves stay in secure storage (§8) and are read
// on demand at request time; they are never copied here. Persisted to prefs (identity + flags
// only — never tokens) starting Phase 2; this is the shape only, with no accounts yet.
// TODO(Phase 2): full OAuth round, prefs persistence, token-lifecycle transitions (auth.md's
// mode-change table), forced-logout handling.

import { create } from 'zustand';

export interface StoredAccount {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** null = no app token held (needs reauth). The granted scope, not the requested one, is what
   * makes useCanWrite() true — see auth.md's "scope must always be sent explicitly". */
  appTokenScope: 'read' | 'read,write' | null;
  hasServiceToken: boolean;
  notificationRegistrationId: string | null;
  notificationStatus: 'active' | 'read-token-invalid' | null;
}

interface AccountsState {
  accounts: StoredAccount[];
  activeAccountId: string | null;
}

export const useAccountsStore = create<AccountsState>(() => ({
  accounts: [],
  activeAccountId: null,
}));

export function useActiveAccount(): StoredAccount | null {
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  return accounts.find((a) => a.id === activeAccountId) ?? null;
}

/** The only thing any UI or route guard should consult for write-gating (rules.md: "the gate is
 * live token possession, not a remembered mode label"). */
export function useCanWrite(): boolean {
  const active = useActiveAccount();
  return active?.appTokenScope === 'read,write';
}
