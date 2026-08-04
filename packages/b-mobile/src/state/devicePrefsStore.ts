// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Device-level preferences with no per-account scope (except `reminders`, which is keyed *by*
// account but is itself device-local — rules.md never asks reminder settings to travel with the
// portable backup folder). Starts small and grows per-phase rather than being rebuilt each time:
// `confirmAccountBeforeReaction` (Phase 4, FLW-06/07), `reminders` (Phase 7, FLW-18). Phase 8
// (SCR-25/29) adds the remaining device-local fields app-architecture.md §6 assigns to this
// store: `uploadFullSize` (SCR-25 Misc — persisted now; SCR-10/SCR-13's compose path never reads
// it, since no client-side downscaling exists anywhere in this app yet — that's a real gap
// predating this phase, not something Phase 8 papers over, see AGENT_LOG.md's Phase 8 entry),
// `openBlipfotoLinksInApp` (SCR-29's link-handling toggle — §16's opt-in `<activity-alias>`; the
// toggle's value is stored here now, the native mechanism to *act* on it doesn't exist until
// Phase 10 checks in an `android/` project to hold the alias), and
// `notificationPollingIntervalMinutes` (SCR-25 Notifications' Advanced control — stored locally
// since there's no deployed b-push registration to PATCH yet; Phase 9 wires the live call).

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
  /** SCR-25 Misc. Default `true` matches actual current behaviour (nothing downscales yet), so
   * turning this "off" is the opt-in, not the other way round. */
  uploadFullSize: boolean;
  /** SCR-29. Default off per rules.md's "Navigation, deep links & sharing" — the app must not
   * silently claim blipfoto.com links on install. */
  openBlipfotoLinksInApp: boolean;
  /** SCR-25 Notifications' Advanced control. Server floor is 5 minutes (notification-service.md);
   * enforced client-side here too since there's no live service to enforce it yet. */
  notificationPollingIntervalMinutes: number;
}

interface DevicePrefsState extends PersistedShape {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setConfirmAccountBeforeReaction: (value: boolean) => void;
  setReminder: (accountId: string, setting: ReminderSetting) => void;
  clearReminder: (accountId: string) => void;
  setUploadFullSize: (value: boolean) => void;
  setOpenBlipfotoLinksInApp: (value: boolean) => void;
  setNotificationPollingIntervalMinutes: (minutes: number) => void;
}

const defaults: PersistedShape = {
  confirmAccountBeforeReaction: false,
  reminders: {},
  uploadFullSize: true,
  openBlipfotoLinksInApp: false,
  notificationPollingIntervalMinutes: 5,
};

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

  setUploadFullSize: (value) => {
    set((prev) => {
      const shape: PersistedShape = { ...toPersisted(prev), uploadFullSize: value };
      persist(shape);
      return shape;
    });
  },

  setOpenBlipfotoLinksInApp: (value) => {
    set((prev) => {
      const shape: PersistedShape = { ...toPersisted(prev), openBlipfotoLinksInApp: value };
      persist(shape);
      return shape;
    });
  },

  setNotificationPollingIntervalMinutes: (minutes) => {
    set((prev) => {
      const floored = Math.max(5, Math.round(minutes));
      const shape: PersistedShape = {
        ...toPersisted(prev),
        notificationPollingIntervalMinutes: floored,
      };
      persist(shape);
      return shape;
    });
  },
}));

function toPersisted(state: PersistedShape): PersistedShape {
  return {
    confirmAccountBeforeReaction: state.confirmAccountBeforeReaction,
    reminders: state.reminders,
    uploadFullSize: state.uploadFullSize,
    openBlipfotoLinksInApp: state.openBlipfotoLinksInApp,
    notificationPollingIntervalMinutes: state.notificationPollingIntervalMinutes,
  };
}
