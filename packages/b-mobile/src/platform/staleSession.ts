// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Recovery from a stale desktop session (b-oss#678). The desktop app stays running in the tray, so
// its files can be replaced underneath it (a synced build, an update); the running page then fails to
// fetch a lazily loaded chunk whose hashed name no longer exists. Reloading once picks up the new
// `index`. A flag with a timestamp stops a chunk that is genuinely missing from looping: a second
// failure inside the window falls through to the normal error screen. Desktop only: the Android
// APK's assets never change in place, and a browser tab is left alone.

import { desktopBridge } from './desktop.js';

export const RELOAD_FLAG = 'bmpc-stale-chunk-reload';
export const GUARD_WINDOW_MS = 60_000;

/** Chromium's text for a failed dynamic import, plus Vite's own preload failure wording. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Unable to preload CSS/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

/** The chunk's file name, for the log. */
export function chunkNameOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = /([^/\s]+\.(?:js|css))/.exec(message);
  return match?.[1] ?? 'unknown';
}

/** True if a reload is allowed now (and records it); false inside the guard window. */
export function claimReload(storage: Pick<Storage, 'getItem' | 'setItem'>, now: number): boolean {
  const last = Number(storage.getItem(RELOAD_FLAG));
  if (Number.isFinite(last) && last > 0 && now - last < GUARD_WINDOW_MS) return false;
  storage.setItem(RELOAD_FLAG, String(now));
  return true;
}

/** Reloads once if `error` is a failed chunk load on desktop. Returns whether it reloaded. */
export function recoverFromStaleChunk(error: unknown): boolean {
  if (!desktopBridge() || !isChunkLoadError(error)) return false;
  try {
    if (!claimReload(window.sessionStorage, Date.now())) return false;
  } catch {
    return false; // no storage: cannot guard against a loop, so do not reload
  }
  console.warn('[stale-session] chunk failed to load, reloading once:', chunkNameOf(error));
  window.location.reload();
  return true;
}

export function installStaleSessionRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (recoverFromStaleChunk((event as Event & { payload?: unknown }).payload)) {
      event.preventDefault();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    recoverFromStaleChunk(event.reason);
  });
}
