// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Saves an image into the phone's gallery (Pictures/b-mobile) via the local MediaSavePlugin
// (android/app/.../MediaSavePlugin.java). `source` is whatever platform/imageCache.ts resolved —
// a file:// URI of the cached copy on device. Off native there is no gallery: the browser just
// opens the image URL, which is enough for desktop-browser development.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface MediaSavePlugin {
  saveImage(options: { uri: string; fileName: string }): Promise<{ location: string }>;
}

const MediaSave = registerPlugin<MediaSavePlugin>('MediaSave');

/** Returns where it was saved (a human-readable path), or `null` when it was merely opened (web). */
export async function saveImageToGallery(source: string, fileName: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    window.open(source, '_blank', 'noopener');
    return null;
  }
  const { location } = await MediaSave.saveImage({ uri: source, fileName });
  return location;
}
