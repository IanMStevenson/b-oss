// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps the native PhotoPick plugin (android/.../PhotoPickPlugin.java): one gallery pick that
// returns a cached copy of the photo AND the GPS position embedded in the original. The stock
// camera plugin's picker can't: Android redacts a photo's location unless the app asks for it
// (b-oss#650). On Android 17+ the system asks the user once; on 10-16 the plugin asks for
// ACCESS_MEDIA_LOCATION at the point of use. When the position is withheld it is simply absent.

import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativePickedPhoto {
  /** Absolute path of the cached copy (not a content:// URI). */
  path: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  /** ISO 8601 with offset, from EXIF DateTimeOriginal when present. */
  createdAt?: string;
  lat?: number;
  lon?: number;
}

interface PhotoPickPlugin {
  /** Rejects with message "cancelled" when the user backs out. */
  pick(): Promise<NativePickedPhoto>;
}

const PhotoPick = registerPlugin<PhotoPickPlugin>('PhotoPick');

/** Whether the native picker exists here (Android only; web uses the camera plugin's file input). */
export function hasNativePhotoPick(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export function pickNativePhoto(): Promise<NativePickedPhoto> {
  return PhotoPick.pick();
}
