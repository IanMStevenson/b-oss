// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What crosses the bridge for desktop notifications (b-oss#610). The payload is the same shape as
// b-mobile's PushPayload (platform/push.ts), so the app's existing tap routing applies unchanged.

export type NotifyStream = 'comments' | 'notifications';

export type NotifyPayload =
  | { kind: 'activity'; stream: NotifyStream; accountId: string }
  | { kind: 'reauth-required'; accountId: string };

/** One account the poller should watch: only accounts with at least one stream on are sent. */
export interface NotifyAccountConfig {
  accountId: string;
  streams: { comments: boolean; notifications: boolean };
}

export interface NotifySettings {
  /** Keep running in the tray while there is something to poll for. */
  accounts: NotifyAccountConfig[];
}

const MAX_ACCOUNTS = 32;
const MAX_ID_LENGTH = 128;

/** The renderer is untrusted input: accept only the exact shape, drop anything else. Accounts with
 * both streams off are dropped (nothing to watch), duplicates keep the first. */
export function parseNotifySettings(input: unknown): NotifySettings {
  if (typeof input !== 'object' || input === null) throw new TypeError('Invalid notify settings');
  const raw = (input as { accounts?: unknown }).accounts;
  if (!Array.isArray(raw) || raw.length > MAX_ACCOUNTS) {
    throw new TypeError('Invalid notify settings');
  }
  const seen = new Set<string>();
  const accounts: NotifyAccountConfig[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) throw new TypeError('Invalid notify account');
    const { accountId, streams } = item as { accountId?: unknown; streams?: unknown };
    if (
      typeof accountId !== 'string' ||
      accountId.length === 0 ||
      accountId.length > MAX_ID_LENGTH
    ) {
      throw new TypeError('Invalid notify account id');
    }
    if (typeof streams !== 'object' || streams === null) {
      throw new TypeError('Invalid notify streams');
    }
    const { comments, notifications } = streams as Record<string, unknown>;
    if (typeof comments !== 'boolean' || typeof notifications !== 'boolean') {
      throw new TypeError('Invalid notify streams');
    }
    if ((!comments && !notifications) || seen.has(accountId)) continue;
    seen.add(accountId);
    accounts.push({ accountId, streams: { comments, notifications } });
  }
  return { accounts };
}

/** Where the web app keeps an account's single app token in the secure store
 * (b-mobile `platform/secureStorage.ts`, `token:<accountId>:app`). The poller reads it from there
 * at poll time and never holds on to it. Keep in step with that module. */
export function appTokenKey(accountId: string): string {
  return `token:${accountId}:app`;
}
