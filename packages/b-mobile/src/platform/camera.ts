// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/camera: capture / pick, returning a file path (not base64 — §15). Camera
// permission is requested only when "Take a photo" is tapped; the system picker needs none.
// TODO(Phase 7): implement against @capacitor/camera.

export interface PickedPhoto {
  path: string;
  mimeType: string;
}

export function takePhoto(): Promise<PickedPhoto | null> {
  return Promise.reject(new Error('platform/camera.ts: not implemented until Phase 7'));
}

export function pickPhoto(): Promise<PickedPhoto | null> {
  return Promise.reject(new Error('platform/camera.ts: not implemented until Phase 7'));
}
