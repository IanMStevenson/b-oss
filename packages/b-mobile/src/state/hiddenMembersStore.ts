// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The hidden-members list (FLW-10, rules.md "Hiding: what suppression means"). Entirely
// device-local — nothing here is ever sent to Blipfoto or the notification service — and per
// account, since it describes this account's relationship to each member: switching the active
// account switches which list is in force. Keyed by username (the platform's only stable
// cross-context identifier for a member — a hidden member who renames stops being recognised
// until hidden again, a documented platform limitation, not a bug here).

import { create } from 'zustand';
import { getPref, setPref } from '../platform/prefs.js';
import { useAccountsStore } from './accountsStore.js';

const PREFS_KEY = 'b-mobile:hidden-members';

type HiddenByAccount = Record<string, string[]>;

interface HiddenMembersState {
  hydrated: boolean;
  hiddenByAccount: HiddenByAccount;
  hydrate: () => Promise<void>;
  hide: (accountId: string, username: string) => void;
  unhide: (accountId: string, username: string) => void;
}

function persist(hiddenByAccount: HiddenByAccount): void {
  void setPref(PREFS_KEY, JSON.stringify(hiddenByAccount));
}

export const useHiddenMembersStore = create<HiddenMembersState>((set, get) => ({
  hydrated: false,
  hiddenByAccount: {},

  hydrate: async () => {
    const raw = await getPref(PREFS_KEY);
    if (raw) {
      try {
        set({ hiddenByAccount: JSON.parse(raw) as HiddenByAccount, hydrated: true });
        return;
      } catch {
        // Corrupt prefs — fall through to an empty, hydrated state rather than crash launch.
      }
    }
    set({ hydrated: true });
  },

  hide: (accountId, username) => {
    const existing = get().hiddenByAccount[accountId] ?? [];
    if (existing.includes(username)) return;
    const hiddenByAccount = { ...get().hiddenByAccount, [accountId]: [...existing, username] };
    persist(hiddenByAccount);
    set({ hiddenByAccount });
  },

  unhide: (accountId, username) => {
    const existing = get().hiddenByAccount[accountId] ?? [];
    if (!existing.includes(username)) return;
    const hiddenByAccount = {
      ...get().hiddenByAccount,
      [accountId]: existing.filter((u) => u !== username),
    };
    persist(hiddenByAccount);
    set({ hiddenByAccount });
  },
}));

/** The active account's hidden list. Empty (never hidden) when signed out — hiding is account-
 * scoped and an anonymous session has no account to scope it to. */
export function useHiddenMembers(): string[] {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  return useHiddenMembersStore((s) =>
    activeAccountId ? (s.hiddenByAccount[activeAccountId] ?? []) : [],
  );
}

export function useIsHidden(username: string | null | undefined): boolean {
  const hidden = useHiddenMembers();
  return username != null && hidden.includes(username);
}
