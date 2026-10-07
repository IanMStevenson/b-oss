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
  /** Local copy of the two per-account push streams b-push holds (b-oss#244), so Settings and
   * Accounts render without a network call. Optional because accounts persisted before #244 have
   * neither — `pushStreamsOf()` treats a missing value as on, matching the service's default. Kept
   * across a forced logout so "Sign in again" restores what the user had. */
  pushComments?: boolean;
  pushNotifications?: boolean;
  /** The app-token scope held before a forced logout cleared it (b-oss#263), so signing in again
   * uses the same mode without asking. Optional: accounts persisted before #263 have none, and
   * re-sign-in then falls back to read-write (the gated sign-in's default). */
  lastAppTokenScope?: 'read' | 'read,write';
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

/** The two push streams (b-oss#244). "Notifications on" = at least one is on. */
export interface PushStreams {
  comments: boolean;
  notifications: boolean;
}

export const ALL_PUSH_STREAMS: PushStreams = { comments: true, notifications: true };

/** Notification state as shown to the user (SCR-25/SCR-30). `needs-sign-in` = the service
 * reported this account's read token dead (FLW-02's reauth-required push or the launch-time
 * check); the registration preferences survive, so signing in again restores them. */
export type NotificationState = 'on' | 'off' | 'needs-sign-in';

/** Whether the account had notifications on before a token died (b-oss#263): it still holds a
 * service token, the service reported it dead, or a registration survives without one. Signing in
 * again then turns them back on as part of the same flow. */
export function hadNotifications(account: StoredAccount): boolean {
  return (
    account.hasServiceToken ||
    account.notificationStatus === 'read-token-invalid' ||
    account.notificationRegistrationId !== null
  );
}

export function notificationStateOf(account: StoredAccount): NotificationState {
  if (account.hasServiceToken) return 'on';
  if (account.notificationStatus === 'read-token-invalid') return 'needs-sign-in';
  return 'off';
}

/** The stored stream choice, missing values defaulting to on. This is the *preference*, not
 * whether pushes are flowing — callers combine it with `notificationStateOf()`. */
export function pushStreamsOf(account: StoredAccount): PushStreams {
  return {
    comments: account.pushComments ?? true,
    notifications: account.pushNotifications ?? true,
  };
}

/** Whether turning notifications back on after turning them off would need a fresh Blipfoto
 * sign-in. True for read-write accounts, whose notification read token is a separate credential
 * that's revoked on the way off; a read-only account reuses its app token, so no sign-in. */
export function reenablingNeedsSignIn(account: StoredAccount): boolean {
  return account.appTokenScope === 'read,write';
}
