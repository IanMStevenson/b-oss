// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The unread-count badges SCR-23/SCR-24's nav entry points show (FLW-15: "An unread count, shown
// as a badge on the inbox entry point"). In-memory only, scoped to whichever account is active —
// not persisted ("no caching for display": a badge is a live server figure, not
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

// Bumped whenever a stream's count is cleared or reset. A refresh records them before it fetches
// and only applies a stream's total if nothing has cleared it in the meantime: otherwise a refresh
// that started first (e.g. on the account switch a push tap makes) could finish after the inbox had
// cleared the badge and marked everything read, and put the stale count back (b-oss#148). The same
// check stops one account's in-flight refresh landing on the next account after a switch.
let commentsEpoch = 0;
let notificationsEpoch = 0;

export const useNotificationCountsStore = create<NotificationCountsState>((set) => ({
  comments: 0,
  notifications: 0,

  refresh: async () => {
    const startedAt = { comments: commentsEpoch, notifications: notificationsEpoch };
    try {
      const totals = await fetchUnreadTotals();
      set({
        ...(startedAt.comments === commentsEpoch ? { comments: totals.comments } : {}),
        ...(startedAt.notifications === notificationsEpoch
          ? { notifications: totals.notifications }
          : {}),
      });
    } catch {
      // A failed refresh leaves the last-known counts showing rather than zeroing them — a
      // transient network error shouldn't read as "you have no unread activity."
    }
  },

  clearComments: () => {
    commentsEpoch++;
    set({ comments: 0 });
  },
  clearNotifications: () => {
    notificationsEpoch++;
    set({ notifications: 0 });
  },

  /** Signing out / switching accounts — the previous account's counts have nothing to do with
   * whichever account (or anonymous session) comes next. */
  reset: () => {
    commentsEpoch++;
    notificationsEpoch++;
    set({ comments: 0, notifications: 0 });
  },
}));
