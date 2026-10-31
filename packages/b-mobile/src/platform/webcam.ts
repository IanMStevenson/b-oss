// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The desktop shell's camera (b-oss#670): getUserMedia for a live preview, a still captured from the
// video element. There is no camera app on a PC, and Capacitor's web fallback for the camera is just
// a file picker, so the app has its own small capture view (components/WebcamCapture.tsx) driven by
// the pure state machine here. Nothing in this file touches the DOM beyond the video element and a
// canvas it is handed, so the machine is testable with a fake MediaStream.

import type { PickedPhoto } from './camera.js';

/** Whether any video input exists. `enumerateDevices` lists devices without prompting; labels stay
 * empty until access is granted, which is fine for counting. False on any failure. */
export async function hasWebcam(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
}

export type WebcamFailure = 'blocked' | 'no-camera' | 'in-use' | 'unavailable';

/** Plain-language text for each failure. 'blocked' covers both the shell denying the request and
 * the Windows camera privacy setting. Never shown as an error screen: the view stays usable. */
export const WEBCAM_FAILURE_TEXT: Record<WebcamFailure, string> = {
  blocked:
    'Camera access is blocked. On Windows, turn on Settings > Privacy & security > Camera (including "Let desktop apps access your camera"), then try again.',
  'no-camera': 'No camera was found on this computer.',
  'in-use': 'The camera is being used by another app. Close it and try again.',
  unavailable: 'The camera could not be started.',
};

export function classifyWebcamError(err: unknown): WebcamFailure {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-camera';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'unavailable';
}

export type WebcamState =
  | { kind: 'starting' }
  | { kind: 'live' }
  | { kind: 'review'; photoUrl: string }
  | { kind: 'failed'; reason: WebcamFailure };

export type WebcamEvent =
  | { type: 'started' }
  | { type: 'failed'; reason: WebcamFailure }
  | { type: 'captured'; photoUrl: string }
  | { type: 'retake' };

export function webcamReducer(state: WebcamState, event: WebcamEvent): WebcamState {
  switch (event.type) {
    case 'started':
      return state.kind === 'starting' || state.kind === 'live' ? { kind: 'live' } : state;
    case 'failed':
      return { kind: 'failed', reason: event.reason };
    case 'captured':
      return state.kind === 'live' ? { kind: 'review', photoUrl: event.photoUrl } : state;
    case 'retake':
      return state.kind === 'review' ? { kind: 'live' } : state;
  }
}

export async function openWebcam(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('', 'NotFoundError');
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Draws the current frame to a JPEG blob. Null when the video has no frame yet. */
export function grabFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

/** The same object the file picker returns, so the New entry flow cannot tell them apart. */
export function toPickedPhoto(
  blob: Blob,
  webPath: string,
  size: { width: number; height: number },
  now: Date = new Date(),
): PickedPhoto {
  return {
    webPath,
    mimeType: 'image/jpeg',
    width: size.width,
    height: size.height,
    createdAt: now.toISOString(),
    sizeBytes: blob.size,
  };
}
