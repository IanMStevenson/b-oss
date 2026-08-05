// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps the local ShareIntentPlugin (android/app/.../ShareIntentPlugin.java — not an npm
// package, single-project only, same precedent as platform/blipfotoLinks.ts). FLW-12's
// share-to-Blipfoto entry point (app-architecture.md §16): @capacitor/app's own appUrlOpen/
// getLaunchUrl only ever see a VIEW-action launch URL, never an ACTION_SEND intent's binary
// extras, so this is the one place that gap is closed.
//
// The native side's `getSharedImage()` is one-shot — it clears the Intent's `EXTRA_STREAM` the
// moment it's read — so there must be exactly one call site. That's `AppShell.tsx`'s
// `DeepLinkListener`, on both cold start and the `onShareReceived` warm-start signal, *before*
// navigating to `/compose`. It can't be `NewEntryScreen` itself: `/compose` is wrapped in
// `WriteGuardRoute` (FLW-12's "through the same write gate as SCR-09"), which may run an entire
// OAuth round before `NewEntryScreen` ever mounts — the photo has to survive that wait, so
// `checkForSharedImage()` caches it here in module state, and `NewEntryScreen` retrieves it via
// `takePendingSharedPhoto()` once it actually mounts (i.e. once the gate has passed).
//
// No web fallback — sharing a file into a desktop-browser tab isn't a real scenario (§19's
// browser-mode development is for testing signed-in screens, not native OS share sheets), so
// every export here is a no-op off native, the same stance every other platform/*.ts module takes.

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PickedPhoto } from './camera.js';

interface RawSharedImage {
  path: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

interface ShareIntentPlugin {
  getSharedImage(): Promise<RawSharedImage>;
  addListener(eventName: 'shareReceived', listener: () => void): Promise<{ remove: () => void }>;
}

const ShareIntent = registerPlugin<ShareIntentPlugin>('ShareIntent');

function toPickedPhoto(raw: RawSharedImage): PickedPhoto | null {
  if (!raw.path) return null;
  return {
    uri: raw.path,
    webPath: raw.path,
    mimeType: raw.mimeType ?? 'image/jpeg',
    width: raw.width && raw.width > 0 ? raw.width : null,
    height: raw.height && raw.height > 0 ? raw.height : null,
    createdAt: null,
    sizeBytes: raw.sizeBytes ?? null,
  };
}

let pendingSharedPhoto: PickedPhoto | null = null;

/** Called once from `AppShell.tsx`'s `DeepLinkListener` per cold start / warm-start share signal
 * — consumes the native side's one-shot state and caches the result for
 * `takePendingSharedPhoto()`. Returns whether a photo was actually found, which is all the
 * caller needs to decide whether to navigate to `/compose` at all. */
export async function checkForSharedImage(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const raw = await ShareIntent.getSharedImage();
  pendingSharedPhoto = toPickedPhoto(raw);
  return pendingSharedPhoto !== null;
}

/** `NewEntryScreen`'s own mount check — reads and clears the cache `checkForSharedImage()`
 * populated, so a screen remount (e.g. backing out and re-entering `/compose`) doesn't
 * re-seed the same draft a second time. */
export function takePendingSharedPhoto(): PickedPhoto | null {
  const photo = pendingSharedPhoto;
  pendingSharedPhoto = null;
  return photo;
}

/** Warm start only — a share arriving while the app is already running. The event itself carries
 * no payload; it only signals "call `checkForSharedImage()` now". */
export function onShareReceived(handler: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => void } | undefined;
  void ShareIntent.addListener('shareReceived', handler).then((h) => {
    handle = h;
  });
  return () => handle?.remove();
}
