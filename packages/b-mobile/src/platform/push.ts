// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/push-notifications: permission state, device token, received-push events
// (§11). Permission must be checked/requested *before* the read-token authorization round when
// enabling notifications (rules.md) — never make the user authorize something already known to
// be undeliverable.
// TODO(Phase 9): implement against @capacitor/push-notifications.

export type PushPermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

export function checkPushPermission(): Promise<PushPermissionState> {
  return Promise.resolve('prompt');
}

export function requestPushPermission(): Promise<PushPermissionState> {
  return Promise.reject(new Error('platform/push.ts: not implemented until Phase 9'));
}

export function registerPush(): Promise<string | null> {
  return Promise.reject(new Error('platform/push.ts: not implemented until Phase 9'));
}

export function onPushReceived(_handler: (payload: unknown) => void): () => void {
  return () => {};
}
