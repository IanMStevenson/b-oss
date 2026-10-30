// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Profile defaults: what we *choose* per platform (as opposed to capabilities, which say what a
// platform can do, and layout, which follows the window live). One table, one row per profile; the
// profile is fixed for the life of the app, so a default never flips when a window is resized
// (b-oss#633, epic b-oss#605). Screens and components call `profile()`; only this folder and
// platform/** may know which platform hosts the app (enforced by ESLint).

import { platformKind, type PlatformKind } from '../platform/platformKind.js';
import type { ThemePreference } from '../theme/themeTypes.js';

export type ProfileKind = 'handheld' | 'desktop';

export interface ReminderSetting {
  enabled: boolean;
  hour: number;
  minute: number;
}

/** Every device-level preference and its value. A profile row supplies the default for each; the
 * user's own changes are stored on top as overrides (state/devicePrefsStore.ts). */
export interface DevicePrefValues {
  /** On by default; Settings → App (SCR-25) exposes the toggle. Gates the account-confirm
   * dialog before a star/favourite/comment (flows/useAccountConfirmGate.tsx). */
  confirmAccountBeforeReaction: boolean;
  /** Keyed by accountId. Absent = never configured (never offered/enabled) — distinct from
   * `{enabled: false}`, though nothing currently reads that distinction; kept anyway since a
   * missing entry costs nothing and avoids inventing a placeholder time for every account. */
  reminders: Record<string, ReminderSetting>;
  /** SCR-25 Misc. Default `true` matches actual current behaviour (nothing downscales yet), so
   * turning this "off" is the opt-in, not the other way round. */
  uploadFullSize: boolean;
  /** SCR-29. Default off (BEHAVIOUR.md, "Errors and network": deep links) — the app must not
   * silently claim blipfoto.com links on install. */
  openBlipfotoLinksInApp: boolean;
  /** SCR-25 Notifications' Advanced control. Server floor is 5 minutes (b-push ARCHITECTURE.md);
   * enforced client-side here too since there's no live service to enforce it yet. */
  notificationPollingIntervalMinutes: number;
  /** SCR-01's first-run explainer (Phase 12.1, OverlayProvider) — shown once above the mode
   * choice on the first deliberate visit, never again after dismissal. */
  seenFirstRunExplainer: boolean;
  /** SCR-25 Browsing section. All three below are EntryGrid/ThumbnailGrid display prefs, not
   * account-scoped — device-wide like Misc's fields. */
  showZoomBar: boolean;
  showPagination: boolean;
  /** 'normal' = today's spacing. 'narrow' keeps the same column count as 'normal' at a given zoom
   * level but shrinks margins/gaps to a few px. 'none' removes margins/gaps entirely, at which
   * point zoom directly controls how many thumbnails fit per row (ThumbnailGrid.tsx's own header
   * comment on the margins prop has the full column-count reasoning). */
  thumbnailMargins: 'none' | 'narrow' | 'normal';
  /** EntryGrid's own zoom control (ThumbnailGrid's sizePercent): one shared, persisted value across
   * Browse/Tag-entries/Search/Profile's own grid. */
  thumbnailZoomPercent: number;
  /** Entry page photo: 'full-width' (default, Blipfoto's behaviour — fills the column however tall,
   * so a portrait scrolls) or 'capped' (height-limited so the whole picture fits on screen). */
  photoFit: 'full-width' | 'capped';
  /** What represents an account in the header indicator and account switcher: its Blipfoto
   * profile picture (default; falls back to the icon when it has none) or the generic user icon. */
  accountAvatarStyle: 'picture' | 'icon';
  /** Colour theme (b-oss#549). 'system' follows the OS's dark setting (light or dark, never mid). */
  theme: ThemePreference;
}

export interface Profile {
  kind: ProfileKind;
  /** Defaults for the device preferences. */
  prefs: DevicePrefValues;
  grid: {
    /** ThumbnailGrid's tile size is `baseTilePx * sizePercent / 100`; handed to b-view as a prop. */
    baseTilePx: number;
    /** The minimum zoom follows the window width (b-view's rule from b-oss#140). Off on desktop,
     * where on a wide window that floor would sit above the default 100%. */
    widthDerivedMinZoom: boolean;
  };
  /** Ctrl+wheel and Ctrl +/-/0 drive the app's own zoom (grid and photo), and the shell's page zoom
   * is disabled so there is exactly one. Off on handheld, where touch pinch is the zoom. */
  keyboardWheelZoom: boolean;
}

/** The values the handheld row has always had (they used to live in devicePrefsStore). Frozen
 * here as the reference the override-only persistence migrates old stored objects against. */
export const HANDHELD_PREFS: DevicePrefValues = {
  confirmAccountBeforeReaction: true,
  reminders: {},
  uploadFullSize: true,
  openBlipfotoLinksInApp: false,
  notificationPollingIntervalMinutes: 5,
  seenFirstRunExplainer: false,
  showZoomBar: true,
  showPagination: true,
  thumbnailMargins: 'none',
  thumbnailZoomPercent: 100,
  photoFit: 'full-width',
  accountAvatarStyle: 'picture',
  theme: 'system',
};

// ThumbnailGrid's own default base (156px) is the PC reference. On a phone that yields only 2
// columns (3 would need ~578px); 86px comfortably fits 3 across at 100%.
const HANDHELD_BASE_TILE_PX = 86;
const DESKTOP_BASE_TILE_PX = 156;

export const PROFILES: Record<ProfileKind, Profile> = {
  handheld: {
    kind: 'handheld',
    prefs: HANDHELD_PREFS,
    grid: { baseTilePx: HANDHELD_BASE_TILE_PX, widthDerivedMinZoom: true },
    keyboardWheelZoom: false,
  },
  desktop: {
    kind: 'desktop',
    // Desktop browsing defaults (b-oss#635): normal margins, the whole photo on screen.
    prefs: { ...HANDHELD_PREFS, thumbnailMargins: 'normal', photoFit: 'capped' },
    grid: { baseTilePx: DESKTOP_BASE_TILE_PX, widthDerivedMinZoom: false },
    keyboardWheelZoom: true,
  },
};

/** Which profile a platform gets. android, ios and web are handheld; the desktop shell is desktop. */
export function profileKindFor(kind: PlatformKind): ProfileKind {
  return kind === 'desktop' ? 'desktop' : 'handheld';
}

/** The active profile, fixed for the life of the app. */
export function profile(): Profile {
  return PROFILES[profileKindFor(platformKind())];
}
