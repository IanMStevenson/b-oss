// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Stored accounts, the active account, and token-possession state (§6). Token possession is
// state, not a storage detail — the tokens themselves stay in secure storage (§8) and are read
// on demand at request time; they are never copied here. Persisted to prefs (identity + flags
// only — never tokens), matching §6's table.

import { create } from 'zustand';
import { getPref, setPref } from '../platform/prefs.js';

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

interface PersistedShape {
  accounts: StoredAccount[];
  activeAccountId: string | null;
}

const PREFS_KEY = 'b-mobile:accounts';

function persist(state: PersistedShape): void {
  void setPref(PREFS_KEY, JSON.stringify(state));
}

interface AccountsState extends PersistedShape {
  hydrated: boolean;
}

interface AccountsActions {
  hydrate: () => Promise<void>;
  upsertAccount: (account: StoredAccount) => void;
  updateAccount: (id: string, patch: Partial<StoredAccount>) => void;
  setActiveAccountId: (id: string | null) => void;
  removeAccountLocally: (id: string) => void;
}

export const useAccountsStore = create<AccountsState & AccountsActions>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  hydrated: false,

  hydrate: async () => {
    const raw = await getPref(PREFS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PersistedShape;
        set({ accounts: parsed.accounts, activeAccountId: parsed.activeAccountId, hydrated: true });
        return;
      } catch {
        // Corrupt prefs — fall through to an empty, hydrated state rather than crash launch.
      }
    }
    set({ hydrated: true });
  },

  upsertAccount: (account) => {
    const idx = get().accounts.findIndex((a) => a.id === account.id);
    const accounts =
      idx >= 0
        ? get().accounts.map((a, i) => (i === idx ? account : a))
        : [...get().accounts, account];
    persist({ accounts, activeAccountId: get().activeAccountId });
    set({ accounts });
  },

  updateAccount: (id, patch) => {
    const accounts = get().accounts.map((a) => (a.id === id ? { ...a, ...patch } : a));
    persist({ accounts, activeAccountId: get().activeAccountId });
    set({ accounts });
  },

  setActiveAccountId: (id) => {
    persist({ accounts: get().accounts, activeAccountId: id });
    set({ activeAccountId: id });
  },

  removeAccountLocally: (id) => {
    const accounts = get().accounts.filter((a) => a.id !== id);
    const activeAccountId =
      get().activeAccountId === id ? (accounts[0]?.id ?? null) : get().activeAccountId;
    persist({ accounts, activeAccountId });
    set({ accounts, activeAccountId });
  },
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
