// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/geolocation: current position, permission state (§13). Permission is
// requested at the point of use (map my-location control, Nearby feed, location picker) —
// never on screen entry. @capacitor/geolocation ships its own web implementation (backed by
// navigator.geolocation), so unlike platform/browser.ts this needs no manual
// Capacitor.isNativePlatform() branching — `vite dev` in a desktop browser gets a real,
// permission-prompting implementation for free.
//
// Contract: resolves with coordinates on success; resolves `null` when permission was granted
// but a fix genuinely couldn't be obtained (GPS unavailable, timed out); rejects when permission
// was refused or location services are off. Callers that only care about "can I show a map/
// nearby feed right now" (BrowseScreen's Nearby tab, SCR-04's my-location control) can treat a
// rejection and a `null` resolution the same way — a "location isn't available" state — while
// still being able to tell the two apart if a future caller needs to.

import { Geolocation } from '@capacitor/geolocation';

export interface Coordinates {
  lat: number;
  lon: number;
}

/** Resolves once the app holds (or has just been granted) location permission; throws if the
 * user refuses or the platform reports no permission is obtainable (`rules.md`: "requesting the
 * permission can fail without prompting, and that case must be handled"). Reads the *current*
 * permission state on every call rather than remembering a past answer, per rules.md. */
async function ensurePermission(): Promise<void> {
  const current = await Geolocation.checkPermissions();
  if (current.location === 'granted' || current.coarseLocation === 'granted') return;

  if (current.location === 'denied' && current.coarseLocation === 'denied') {
    throw new Error('Location access was refused.');
  }

  const requested = await Geolocation.requestPermissions();
  if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
    throw new Error('Location access was refused.');
  }
}

export async function getCurrentPosition(): Promise<Coordinates | null> {
  await ensurePermission();
  try {
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false });
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch {
    // Permission is held but no fix could be obtained (GPS off, timed out, no signal) — distinct
    // from a permission refusal, which throws above instead.
    return null;
  }
}
