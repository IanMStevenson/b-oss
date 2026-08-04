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
// GPS coordinates are not exposed structurally by MediaMetadata (only a raw, unparsed `exif`
// string), so SCR-10/SCR-12's "location pre-filled from EXIF... when available" is satisfied via
// platform/geolocation.ts's device-location path instead — a deliberate, documented scope
// reduction rather than a hand-rolled EXIF GPS parser (see AGENT_LOG.md's Phase 7 entry).

import { Capacitor } from '@capacitor/core';
import { Camera, CameraDirection } from '@capacitor/camera';

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
  metadata?: { format: string; resolution?: string; creationDate?: string };
}): PickedPhoto {
  const { width, height } = parseResolution(result.metadata?.resolution);
  return {
    uri: result.uri,
    webPath: result.webPath ?? result.uri ?? '',
    mimeType: formatToMimeType(result.metadata?.format ?? 'jpeg'),
    width,
    height,
    createdAt: result.metadata?.creationDate ?? null,
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

export async function takePhoto(): Promise<PickedPhoto | null> {
  await ensureCameraPermission();
  try {
    const result = await Camera.takePhoto({
      quality: 90,
      correctOrientation: true,
      cameraDirection: CameraDirection.Rear,
      includeMetadata: true,
    });
    return toPickedPhoto(result);
  } catch (err) {
    if (isUserCancelled(err)) return null;
    throw err;
  }
}

export async function pickPhoto(): Promise<PickedPhoto | null> {
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
  return Capacitor.isNativePlatform();
}
