// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Device-level preferences with no per-account scope. Starts with exactly the one field FLW-06/07
// need now (rules.md, "confirm the account before Star, Favourite, or a comment/reply") — the
// full set (SCR-25's General/Journal/Misc sections) is Phase 8 scope; this file grows there
// rather than being rebuilt, since the toggle this phase depends on must already exist.

import { create } from 'zustand';
import { getPref, setPref } from '../platform/prefs.js';

const PREFS_KEY = 'b-mobile:device-prefs';

interface PersistedShape {
  /** Off by default (rules.md) — until SCR-25 (Phase 8) adds the toggle, this is permanently off
   * in practice, so the account-confirm dialog it gates never fires yet. The gating logic itself
   * is fully implemented now against this flag, ready for Phase 8 to expose it. */
  confirmAccountBeforeReaction: boolean;
}

interface DevicePrefsState extends PersistedShape {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setConfirmAccountBeforeReaction: (value: boolean) => void;
}

const defaults: PersistedShape = { confirmAccountBeforeReaction: false };

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
    const state = { confirmAccountBeforeReaction: value };
    persist(state);
    set(state);
  },
}));
