// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The hidden-members list (FLW-10, BEHAVIOUR.md "Hidden members"). Entirely
// device-local — nothing here is ever sent to Blipfoto or the notification service — and
// installation-wide: one list for this install of the app, whichever account is active and
// whether or not anyone is signed in at all (#362: hiding is "I don't want to see this person on
// this phone", not a property of an account). Keyed by username (the platform's only stable
// cross-context identifier for a member — a hidden member who renames stops being recognised
// until hidden again, a documented platform limitation, not a bug here).

import { create } from 'zustand';
import { getPref, setPref } from '../platform/prefs.js';

const PREFS_KEY = 'b-mobile:hidden-members';

interface HiddenMembersState {
  hydrated: boolean;
  hidden: string[];
  hydrate: () => Promise<void>;
  hide: (username: string) => void;
  unhide: (username: string) => void;
}

function persist(hidden: string[]): void {
  void setPref(PREFS_KEY, JSON.stringify(hidden));
}

/** The stored value is a plain array. Earlier builds kept one list per account
 * (`Record<accountId, string[]>`); those lists are merged into one rather than dropped. */
function parseStored(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  const values: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object'
      ? Object.values(parsed).flatMap((list: unknown): unknown[] =>
          Array.isArray(list) ? list : [],
        )
      : [];
  return [...new Set(values.filter((u): u is string => typeof u === 'string'))];
}

export const useHiddenMembersStore = create<HiddenMembersState>((set, get) => ({
  hydrated: false,
  hidden: [],

  hydrate: async () => {
    const raw = await getPref(PREFS_KEY);
    if (raw) {
      try {
        set({ hidden: parseStored(raw), hydrated: true });
        return;
      } catch {
        // Corrupt prefs — fall through to an empty, hydrated state rather than crash launch.
      }
    }
    set({ hydrated: true });
  },

  hide: (username) => {
    if (get().hidden.includes(username)) return;
    const hidden = [...get().hidden, username];
    persist(hidden);
    set({ hidden });
  },

  unhide: (username) => {
    if (!get().hidden.includes(username)) return;
    const hidden = get().hidden.filter((u) => u !== username);
    persist(hidden);
    set({ hidden });
  },
}));

/** The installation's hidden list. */
export function useHiddenMembers(): string[] {
  return useHiddenMembersStore((s) => s.hidden);
}

export function useIsHidden(username: string | null | undefined): boolean {
  const hidden = useHiddenMembers();
  return username != null && hidden.includes(username);
}
