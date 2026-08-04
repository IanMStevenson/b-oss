// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Device-level preferences with no per-account scope (except `reminders`, which is keyed *by*
// account but is itself device-local — rules.md never asks reminder settings to travel with the
// portable backup folder). Starts small and grows per-phase rather than being rebuilt each time:
// `confirmAccountBeforeReaction` (Phase 4, FLW-06/07), `reminders` (this phase, FLW-18 — the data
// model and scheduling logic are built now even though SCR-25's own toggle UI is Phase 8, the
// same "gate built ahead of its screen" shape `confirmAccountBeforeReaction` established). The
// full set (SCR-25's General/Journal/Misc sections) is still Phase 8 scope.

import { create } from 'zustand';
import { getPref, setPref } from '../platform/prefs.js';

const PREFS_KEY = 'b-mobile:device-prefs';

export interface ReminderSetting {
  enabled: boolean;
  hour: number;
  minute: number;
}

interface PersistedShape {
  /** Off by default (rules.md) — until SCR-25 (Phase 8) adds the toggle, this is permanently off
   * in practice, so the account-confirm dialog it gates never fires yet. The gating logic itself
   * is fully implemented now against this flag, ready for Phase 8 to expose it. */
  confirmAccountBeforeReaction: boolean;
  /** Keyed by accountId. Absent = never configured (never offered/enabled) — distinct from
   * `{enabled: false}`, though nothing currently reads that distinction; kept anyway since a
   * missing entry costs nothing and avoids inventing a placeholder time for every account. */
  reminders: Record<string, ReminderSetting>;
}

interface DevicePrefsState extends PersistedShape {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setConfirmAccountBeforeReaction: (value: boolean) => void;
  setReminder: (accountId: string, setting: ReminderSetting) => void;
  clearReminder: (accountId: string) => void;
}

const defaults: PersistedShape = { confirmAccountBeforeReaction: false, reminders: {} };

function persist(state: PersistedShape): void {
  void setPref(PREFS_KEY, JSON.stringify(state));
}

export const useDevicePrefsStore = create<DevicePrefsState>((set) => ({
  ...defaults,
  hydrated: false,

  hydrate: async () => {
    const raw = await getPref(PREFS_KEY);
    if (raw) {
      try {
        set({ ...defaults, ...(JSON.parse(raw) as Partial<PersistedShape>), hydrated: true });
        return;
      } catch {
        // Corrupt prefs — fall through to defaults rather than crash launch.
      }
    }
    set({ hydrated: true });
  },

  setConfirmAccountBeforeReaction: (value) => {
    set((prev) => {
      const shape: PersistedShape = { ...toPersisted(prev), confirmAccountBeforeReaction: value };
      persist(shape);
      return shape;
    });
  },

  setReminder: (accountId, setting) => {
    set((prev) => {
      const shape: PersistedShape = {
        ...toPersisted(prev),
        reminders: { ...prev.reminders, [accountId]: setting },
      };
      persist(shape);
      return shape;
    });
  },

  clearReminder: (accountId) => {
    set((prev) => {
      if (!(accountId in prev.reminders)) return prev;
      const reminders = { ...prev.reminders };
      delete reminders[accountId];
      const shape: PersistedShape = { ...toPersisted(prev), reminders };
      persist(shape);
      return shape;
    });
  },
}));

function toPersisted(state: PersistedShape): PersistedShape {
  return {
    confirmAccountBeforeReaction: state.confirmAccountBeforeReaction,
    reminders: state.reminders,
  };
}
