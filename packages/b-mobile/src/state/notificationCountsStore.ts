// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The unread-count badges SCR-23/SCR-24's nav entry points show (FLW-15: "An unread count, shown
// as a badge on the inbox entry point"). In-memory only, scoped to whichever account is active —
// not persisted (rules.md's "no caching for display": a badge is a live server figure, not
// content worth remembering across launches). Refreshed on app launch, on account switch, and
// whenever a push arrives (FLW-16 point 4); cleared optimistically the moment an inbox opens
// (FLW-15 step 2 — "clear the badge locally at the same time" as the fetch that does the real
// server-side clearing).

import { create } from 'zustand';
import { fetchUnreadTotals } from '../data/notifications.js';

interface NotificationCountsState {
  comments: number;
  notifications: number;
  refresh: () => Promise<void>;
  clearComments: () => void;
  clearNotifications: () => void;
  reset: () => void;
}

export const useNotificationCountsStore = create<NotificationCountsState>((set) => ({
  comments: 0,
  notifications: 0,

  refresh: async () => {
    try {
      const totals = await fetchUnreadTotals();
      set({ comments: totals.comments, notifications: totals.notifications });
    } catch {
      // A failed refresh leaves the last-known counts showing rather than zeroing them — a
      // transient network error shouldn't read as "you have no unread activity."
    }
  },

  clearComments: () => set({ comments: 0 }),
  clearNotifications: () => set({ notifications: 0 }),

  /** Signing out / switching accounts — the previous account's counts have nothing to do with
   * whichever account (or anonymous session) comes next. */
  reset: () => set({ comments: 0, notifications: 0 }),
}));
