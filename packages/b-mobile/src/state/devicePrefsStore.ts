// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Device-level preferences with no per-account scope (except `reminders`, which is keyed *by*
// account but is itself device-local — reminder settings never travel with the portable backup
// folder). Starts small and grows per-phase rather than being rebuilt each time:
// `confirmAccountBeforeReaction` (Phase 4, FLW-06/07), `reminders` (Phase 7, FLW-18). Phase 8
// (SCR-25/29) adds the remaining device-local fields app-architecture.md §6 assigns to this
// store: `uploadFullSize` (SCR-25 Misc — persisted now; SCR-10/SCR-13's compose path never reads
// it, since no client-side downscaling exists anywhere in this app yet — that's a real gap
// predating this phase, not something Phase 8 papers over),
// `openBlipfotoLinksInApp` (SCR-29's link-handling toggle — §16's opt-in `<activity-alias>`,
// wired to a real native effect in Phase 10 via platform/blipfotoLinks.ts), and
// `notificationPollingIntervalMinutes` (SCR-25 Notifications' Advanced control — stored locally
// since there's no deployed b-push registration to PATCH yet; Phase 9 wires the live call).
// `showZoomBar`/`showPagination`/`thumbnailMargins` (SCR-25's new Browsing section) are
// EntryGrid/ThumbnailGrid display prefs — device-wide, not account-scoped.
//
// Defaults live in profile/profile.ts (one row per platform profile). The store exposes the
// *effective* value (the user's override if there is one, else the profile default) but persists
// only the keys the user has changed, so an improved default reaches everyone who never touched
// that setting (b-oss#633, b-oss#634).

import { create } from 'zustand';
import { getPref, setPref } from '../platform/prefs.js';
import { setBlipfotoLinksEnabled } from '../platform/blipfotoLinks.js';
import { isThemePreference } from '../theme/themeTypes.js';
import { HANDHELD_PREFS, profile, type DevicePrefValues } from '../profile/profile.js';

export type { ReminderSetting } from '../profile/profile.js';

const PREFS_KEY = 'b-mobile:device-prefs';
/** Version of the persisted format. Absent (the original format) = a full object of every pref. */
const PERSIST_SCHEMA = 2;

type PersistedShape = DevicePrefValues;
type Overrides = Partial<PersistedShape>;

interface DevicePrefsState extends PersistedShape {
  hydrated: boolean;
  /** The keys the user has changed; the only thing persisted. */
  overrides: Overrides;
  hydrate: () => Promise<void>;
  setConfirmAccountBeforeReaction: (value: boolean) => void;
  setReminder: (accountId: string, setting: PersistedShape['reminders'][string]) => void;
  clearReminder: (accountId: string) => void;
  setUploadFullSize: (value: boolean) => void;
  setOpenBlipfotoLinksInApp: (value: boolean) => void;
  setNotificationPollingIntervalMinutes: (minutes: number) => void;
  setSeenFirstRunExplainer: (value: boolean) => void;
  setShowZoomBar: (value: boolean) => void;
  setShowPagination: (value: boolean) => void;
  setThumbnailMargins: (value: PersistedShape['thumbnailMargins']) => void;
  setThumbnailZoomPercent: (value: number) => void;
  setPhotoFit: (value: PersistedShape['photoFit']) => void;
  setAccountAvatarStyle: (value: PersistedShape['accountAvatarStyle']) => void;
  setTheme: (value: PersistedShape['theme']) => void;
}

const KEYS = Object.keys(HANDHELD_PREFS) as (keyof PersistedShape)[];

function persist(overrides: Overrides): void {
  void setPref(PREFS_KEY, JSON.stringify({ schema: PERSIST_SCHEMA, overrides }));
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Reads a stored value into overrides. The original format was the full object of every pref, as
 * of whatever the defaults were then (the handheld row): those keys become overrides only where
 * they differ from it, so behaviour is unchanged today and later default improvements reach those
 * users. Returns null for anything that isn't an object. */
function readOverrides(raw: string): { overrides: Overrides; migrated: boolean } | null {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const current = record.schema === PERSIST_SCHEMA;
  const source = current ? record.overrides : record;
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  const overrides: Overrides = {};
  for (const key of KEYS) {
    if (!(key in source)) continue;
    const value = (source as Record<string, unknown>)[key];
    if (key === 'theme' && !isThemePreference(value)) continue;
    if (!current && sameValue(value, HANDHELD_PREFS[key])) continue;
    Object.assign(overrides, { [key]: value });
  }
  return { overrides, migrated: !current };
}

export const useDevicePrefsStore = create<DevicePrefsState>((set, get) => {
  /** Applies a user change: it becomes an override, and the effective value follows. */
  function change(patch: Overrides): void {
    const overrides = { ...get().overrides, ...patch };
    persist(overrides);
    set({ ...patch, overrides });
  }

  return {
    ...profile().prefs,
    overrides: {},
    hydrated: false,

    hydrate: async () => {
      const raw = await getPref(PREFS_KEY);
      if (raw) {
        try {
          const read = readOverrides(raw);
          if (read) {
            const effective = { ...profile().prefs, ...read.overrides };
            set({ ...effective, overrides: read.overrides, hydrated: true });
            if (read.migrated) persist(read.overrides);
            // A fresh install always starts with the native <activity-alias> disabled (§16) — if a
            // restored/synced backup folder carries a previously-enabled toggle, the native side
            // needs re-syncing at launch, since nothing else does this on the app's behalf.
            void setBlipfotoLinksEnabled(effective.openBlipfotoLinksInApp);
            return;
          }
        } catch {
          // Corrupt prefs — fall through to defaults rather than crash launch.
        }
      }
      set({ hydrated: true });
    },

    setConfirmAccountBeforeReaction: (value) => change({ confirmAccountBeforeReaction: value }),

    setReminder: (accountId, setting) =>
      change({ reminders: { ...get().reminders, [accountId]: setting } }),

    clearReminder: (accountId) => {
      const prev = get().reminders;
      if (!(accountId in prev)) return;
      const reminders = { ...prev };
      delete reminders[accountId];
      change({ reminders });
    },

    setUploadFullSize: (value) => change({ uploadFullSize: value }),

    setOpenBlipfotoLinksInApp: (value) => {
      change({ openBlipfotoLinksInApp: value });
      void setBlipfotoLinksEnabled(value);
    },

    setNotificationPollingIntervalMinutes: (minutes) =>
      change({ notificationPollingIntervalMinutes: Math.max(5, Math.round(minutes)) }),

    setSeenFirstRunExplainer: (value) => change({ seenFirstRunExplainer: value }),
    setShowZoomBar: (value) => change({ showZoomBar: value }),
    setShowPagination: (value) => change({ showPagination: value }),
    setThumbnailMargins: (value) => change({ thumbnailMargins: value }),
    setThumbnailZoomPercent: (value) => change({ thumbnailZoomPercent: value }),
    setPhotoFit: (value) => change({ photoFit: value }),
    setAccountAvatarStyle: (value) => change({ accountAvatarStyle: value }),
    setTheme: (value) => change({ theme: value }),
  };
});
