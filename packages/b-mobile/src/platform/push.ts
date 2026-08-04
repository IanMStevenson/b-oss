// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/push-notifications (§11): permission state, device token registration, and
// received/tapped push events. `registerPush()` resolves the FCM/APNs token once, from a single
// `register()` call plus its first `'registration'`/`'registrationError'` event — the listener
// pair is torn down as soon as either fires, so concurrent callers each get their own promise
// rather than racing a shared one. `onPushTokenChanged()` is separate and long-lived (mounted
// once from AppShell): the OS can reissue a token at any point *after* the initial register() too
// (FCM token rotation), and notification-service.md requires every account's registration be
// PATCHed with the new value then, or pushes silently stop reaching the device.
//
// Web has no push transport wired into this build (no FCM web SDK) — every export is a no-op off
// native, the same stance platform/localNotifications.ts already takes.

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import type { ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';

export type PushPermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

/** The two payload shapes b-push's FCM messages ever carry (notification-service.md, "What the
 * push can and cannot say" / "System alert: reauth-required") — delivered as an ordinary
 * notification message's `data` fields, never a data-only message (§11: Android defers/drops
 * those in Doze / when force-stopped). */
export type PushPayload =
  | { kind: 'activity'; stream: 'comments' | 'notifications'; accountId: string }
  | { kind: 'reauth-required'; accountId: string };

function parsePayload(data: unknown): PushPayload | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.kind === 'reauth-required' && typeof record.accountId === 'string') {
    return { kind: 'reauth-required', accountId: record.accountId };
  }
  if (
    record.kind === 'activity' &&
    (record.stream === 'comments' || record.stream === 'notifications') &&
    typeof record.accountId === 'string'
  ) {
    return { kind: 'activity', stream: record.stream, accountId: record.accountId };
  }
  return null;
}

export async function checkPushPermission(): Promise<PushPermissionState> {
  if (!Capacitor.isNativePlatform()) return 'denied';
  const status = await PushNotifications.checkPermissions();
  return status.receive;
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (!Capacitor.isNativePlatform()) return 'denied';
  const status = await PushNotifications.requestPermissions();
  return status.receive;
}

/** 'android' | 'ios' for the registration contract's `platform` field — `null` off native (there
 * is nothing to register). */
export function pushPlatform(): 'android' | 'ios' | null {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : null;
}

/** Registers with the OS push transport and resolves with the device token, or `null` if
 * registration fails (`registrationError`) — treated the same as a permission refusal by callers
 * (rules.md: no separate "blocked" state). Must only be called once permission is confirmed
 * granted (rules.md: never authorize something already known to be undeliverable). */
export function registerPush(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let regHandle: { remove: () => void } | undefined;
    let errHandle: { remove: () => void } | undefined;

    function settle(value: string | null): void {
      if (settled) return;
      settled = true;
      regHandle?.remove();
      errHandle?.remove();
      resolve(value);
    }

    void PushNotifications.addListener('registration', (token) => settle(token.value)).then(
      (h) => (regHandle = h),
    );
    void PushNotifications.addListener('registrationError', () => settle(null)).then(
      (h) => (errHandle = h),
    );
    void PushNotifications.register().catch(() => settle(null));
  });
}

/** Long-lived — mounted once from AppShell. Fires on every `'registration'` event *after* the
 * app is already running, i.e. an FCM token rotation, not the initial `registerPush()` call
 * above (that one resolves and tears its own pair of listeners down). */
export function onPushTokenChanged(handler: (token: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => void } | undefined;
  void PushNotifications.addListener('registration', (token) => handler(token.value)).then(
    (h) => (handle = h),
  );
  return () => handle?.remove();
}

/** Foreground delivery — FLW-16 point 4, "receiving a push refreshes unread counts." */
export function onPushReceived(handler: (payload: PushPayload) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => void } | undefined;
  void PushNotifications.addListener(
    'pushNotificationReceived',
    (notification: PushNotificationSchema) => {
      const payload = parsePayload(notification.data);
      if (payload) handler(payload);
    },
  ).then((h) => (handle = h));
  return () => handle?.remove();
}

/** Tap routing — FLW-16 steps 3/7. */
export function onPushTapped(handler: (payload: PushPayload) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => void } | undefined;
  void PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      const payload = parsePayload(action.notification.data);
      if (payload) handler(payload);
    },
  ).then((h) => (handle = h));
  return () => handle?.remove();
}
