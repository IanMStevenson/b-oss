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
import { locationControlAvailable, recordDesktopLocationOutcome } from './capabilities.js';
import { logError } from './diagnostics.js';
import { platformKind } from './platformKind.js';

export interface Coordinates {
  lat: number;
  lon: number;
}

/** Resolves once the app holds (or has just been granted) location permission; throws if the
 * user refuses or the platform reports no permission is obtainable (requesting the permission can
 * fail without prompting, and that case must be handled). Reads the *current* permission state
 * on every call rather than remembering a past answer. */
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

/** Shown when the desktop's first location attempt fails (b-oss#672). */
export const DESKTOP_LOCATION_UNAVAILABLE_MESSAGE =
  'Windows location is off, or not available to this app. You can still pick a place on the map.';

export class LocationUnavailableError extends Error {
  constructor(message: string = DESKTOP_LOCATION_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'LocationUnavailableError';
  }
}

/** One line per attempt for the desktop log: the outcome code and message, and a coarse position
 * (one decimal place, about 10 km) only on success. Never exact coordinates. */
function logLocationAttempt(text: string): void {
  logError({ source: 'geolocation', message: text });
}

/** The picker's control label: "Show current location" on desktop, "My location" as before elsewhere. */
export function locationControlLabel(): string {
  return platformKind() === 'desktop' ? 'Show current location' : 'My location';
}

let desktopSucceeded = false;

/** Desktop: the browser location API directly (the shell grants it for the app origin). The
 * Capacitor permission calls are skipped because the web fallback cannot prompt. Each attempt is
 * logged. A failure on the first attempt hides the location controls for the session. */
async function desktopPosition(): Promise<Coordinates | null> {
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 15000,
    });
    const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
    desktopSucceeded = true;
    recordDesktopLocationOutcome('ok');
    logLocationAttempt(
      `location attempt: ok (coarse ${coords.lat.toFixed(1)},${coords.lon.toFixed(1)}, ` +
        `accuracy ${Math.round(position.coords.accuracy)} m)`,
    );
    return coords;
  } catch (err) {
    const e = err as { code?: unknown; message?: unknown };
    const code = typeof e.code === 'number' ? e.code : 'none';
    const message = typeof e.message === 'string' ? e.message : String(err);
    logLocationAttempt(`location attempt: failed code=${code} message=${message}`);
    if (desktopSucceeded && code === 3) return null; // worked before; this one just timed out
    recordDesktopLocationOutcome('failed');
    throw new LocationUnavailableError();
  }
}

export async function getCurrentPosition(): Promise<Coordinates | null> {
  // Where there is no usable OS location and the desktop attempt has already failed, refuse up
  // front, the same way a refused permission does.
  if (!locationControlAvailable()) throw new Error('Location is not available here.');
  if (platformKind() === 'desktop') return desktopPosition();
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

/** Asks for location access so the system camera will geotag a photo taken for an entry: the
 * camera app embeds the position only when the app that asked for the photo holds a location
 * permission (b-oss#650). Approximate access is enough; the position itself comes from the camera
 * app's own fix, not from this app. Never throws and never blocks the photo: a refusal (or an OS
 * that will no longer prompt) just means the photo carries no position. */
export async function requestGeotagAccess(): Promise<boolean> {
  try {
    const current = await Geolocation.checkPermissions();
    if (current.location === 'granted' || current.coarseLocation === 'granted') return true;
    if (current.location === 'denied' && current.coarseLocation === 'denied') return false;
    const requested = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
    return requested.location === 'granted' || requested.coarseLocation === 'granted';
  } catch {
    return false;
  }
}
