// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/camera: capture / pick, returning a file path (not base64 — §15). Camera
// permission is requested only when "Take a photo" is tapped (i.e. only inside takePhoto() —
// never on screen entry); the system picker (chooseFromGallery) needs none.
//
// Uses the plugin's current API (takePhoto/chooseFromGallery, 8.1.0+), not the deprecated
// getPhoto/pickImages — the current API's MediaResult carries a `metadata` block (resolution,
// creationDate, format) when `includeMetadata: true` is passed, which is what SCR-10 uses for its
// "defaults from photo EXIF date, else today" and too-small validation without needing a
// hand-rolled binary EXIF parser: `creationDate` is the plugin's own EXIF-or-file-mtime read.
// The plugin's gallery picker returns a copy with the photo's GPS redacted by Android, so on
// Android gallery picks go through platform/photoPick.ts instead, which returns the embedded
// position (`gps`). The app never substitutes the phone's own position for a photo's (b-oss#650).

import { Camera, CameraDirection } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { isCapacitorNative } from './platformKind.js';
import { hasNativePhotoPick, pickNativePhoto, readPhotoGps } from './photoPick.js';
import { requestGeotagAccess } from './geolocation.js';
import { desktopBridge } from './desktop.js';

export interface PickedPhoto {
  /** Native file URI — absent on web, where webPath is the only usable source. */
  uri?: string;
  /** Usable directly as an <img src> on both platforms, and as a fetch() source on web. */
  webPath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  /** ISO 8601, from the photo's own metadata when available — SCR-10's EXIF-date default. */
  createdAt: string | null;
  /** From the plugin's own MediaMetadata.size (bytes) — not always populated (e.g. some web
   * fallback paths), so `data/photoValidation.ts`'s max-file-size check treats null as unknown
   * rather than a rejection. */
  sizeBytes: number | null;
  /** The position embedded in the photo, when the platform let it through. Never the phone's
   * own location. Absent for camera captures, shared images and the web fallback. */
  gps?: { lat: number; lon: number } | null;
}

export class CameraPermissionDeniedError extends Error {
  constructor(public readonly canRetry: boolean) {
    super('Camera access was refused.');
    this.name = 'CameraPermissionDeniedError';
  }
}

function formatToMimeType(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'png') return 'image/png';
  if (normalized === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function parseResolution(resolution: string | undefined): {
  width: number | null;
  height: number | null;
} {
  if (!resolution) return { width: null, height: null };
  const match = /^(\d+)x(\d+)$/.exec(resolution);
  if (!match) return { width: null, height: null };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function toPickedPhoto(result: {
  uri?: string;
  webPath?: string;
  metadata?: { format: string; resolution?: string; creationDate?: string; size?: number };
}): PickedPhoto {
  const { width, height } = parseResolution(result.metadata?.resolution);
  return {
    uri: result.uri,
    webPath: result.webPath ?? result.uri ?? '',
    mimeType: formatToMimeType(result.metadata?.format ?? 'jpeg'),
    width,
    height,
    createdAt: result.metadata?.creationDate ?? null,
    sizeBytes: result.metadata?.size ?? null,
  };
}

/** True for both "user backed out of the capture/pick UI" and (on Android) the plugin's own
 * permission-denial rejection message, which doesn't carry a distinguishable error code — SCR-09
 * treats a cancel and a same-turn permission refusal the same way (return to Idle / show the
 * "needs camera access" message), so a loose text match here is adequate; TakePhoto/ChooseFromGallery
 * genuinely have no typed error/cancellation-reason field to switch on instead. */
function isUserCancelled(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return message.includes('cancel');
}

async function ensureCameraPermission(): Promise<void> {
  const current = await Camera.checkPermissions();
  if (current.camera === 'granted' || current.camera === 'limited') return;

  const requested = await Camera.requestPermissions({ permissions: ['camera'] });
  if (requested.camera === 'granted' || requested.camera === 'limited') return;

  // 'denied' after an explicit request means the OS will no longer re-prompt (Android's
  // "don't ask again" / iOS's post-refusal state) — SCR-09's "offer a route to system settings"
  // case. There's no cross-platform "open app settings" call in this app's current plugin set
  // (would need a dedicated settings-deep-link plugin, not otherwise needed anywhere else in the
  // app), so canRetry surfaces the distinction and the screen explains it in words instead of
  // offering a settings button — a deliberate, documented scope reduction, not an oversight.
  throw new CameraPermissionDeniedError(requested.camera !== 'denied');
}

export interface TakePhotoOptions {
  /** Ask for location access first, so the system camera embeds where the photo was taken, and
   * return that position in `gps` (entries only; not wanted for a profile photo). */
  geotag?: boolean;
}

export async function takePhoto(options: TakePhotoOptions = {}): Promise<PickedPhoto | null> {
  await ensureCameraPermission();
  if (options.geotag) await requestGeotagAccess();
  try {
    const result = await Camera.takePhoto({
      quality: 90,
      correctOrientation: true,
      cameraDirection: CameraDirection.Rear,
      includeMetadata: true,
    });
    const photo = toPickedPhoto(result);
    if (options.geotag && result.uri) photo.gps = await readPhotoGps(result.uri);
    return photo;
  } catch (err) {
    if (isUserCancelled(err)) return null;
    throw err;
  }
}

async function pickNative(): Promise<PickedPhoto | null> {
  try {
    const picked = await pickNativePhoto();
    return {
      uri: picked.path,
      webPath: Capacitor.convertFileSrc(picked.path),
      mimeType: picked.mimeType,
      width: picked.width ?? null,
      height: picked.height ?? null,
      createdAt: picked.createdAt ?? null,
      sizeBytes: picked.sizeBytes,
      gps: picked.lat != null && picked.lon != null ? { lat: picked.lat, lon: picked.lon } : null,
    };
  } catch (err) {
    if (isUserCancelled(err)) return null;
    throw err;
  }
}

/** Decodes just enough of an image to learn its size; null if the browser can't read it. */
async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Desktop: the shell's own dialog, which opens in the account's last folder (b-oss#739). */
async function pickViaDesktopShell(accountId: string): Promise<PickedPhoto | null | undefined> {
  const bridge = desktopBridge();
  if (!bridge?.pickPhoto) return undefined;
  const file = await bridge.pickPhoto(accountId);
  if (!file) return null;
  const blob = new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mimeType });
  const size = await imageSize(blob);
  return {
    webPath: URL.createObjectURL(blob),
    mimeType: file.mimeType,
    width: size?.width ?? null,
    height: size?.height ?? null,
    createdAt: new Date(file.modifiedMs).toISOString(),
    sizeBytes: blob.size,
  };
}

/** `accountId` lets the desktop shell reopen the dialog in that account's last photo folder. */
export async function pickPhoto(accountId?: string): Promise<PickedPhoto | null> {
  if (accountId) {
    const viaShell = await pickViaDesktopShell(accountId);
    if (viaShell !== undefined) return viaShell;
  }
  if (hasNativePhotoPick()) return pickNative();
  // No permission requested for this path (§15/SCR-09) — the system picker grants access to the
  // chosen item only, which chooseFromGallery relies on natively.
  try {
    const result = await Camera.chooseFromGallery({ includeMetadata: true });
    const first = result.results[0];
    if (!first) return null;
    return toPickedPhoto(first);
  } catch (err) {
    if (isUserCancelled(err)) return null;
    throw err;
  }
}

/** Whether the platform actually needs the camera-permission dance at all — web's file-input
 * fallback for chooseFromGallery/takePhoto needs none, so SCR-09 can skip rendering permission-
 * specific copy there. */
export function isNativeCamera(): boolean {
  return isCapacitorNative();
}
