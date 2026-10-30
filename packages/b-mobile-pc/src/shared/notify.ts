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

/** How the last check of an account went. `text` is a short plain-language line for the settings
 * screen; it never holds a token or any response content. */
export interface CheckResult {
  kind:
    | 'baseline' // first check: starting counts recorded, nothing announced
    | 'ok' // counts read; `newItems` says how many new since the last check
    | 'offline' // the machine reports no network, or the request could not connect
    | 'sign-in-needed' // Blipfoto rejected the token
    | 'rate-limited'
    | 'no-token' // nothing in the secure store for the account
    | 'error';
  text: string;
  /** Items newer than the last check, whether or not a stream was on for them. */
  newItems?: number;
}

/** What the settings screen shows for one watched account (b-oss#673, #677). Times are epoch ms. */
export interface AccountStatus {
  accountId: string;
  lastCheckedAt: number | null;
  /** When the next check is due (null while one is running, or after "sign in again"). */
  nextCheckAt: number | null;
  checking: boolean;
  result: CheckResult | null;
}

export interface NotifyStatus {
  accounts: AccountStatus[];
}

/** The outcome of "Send a test notification". `ok` means the OS accepted the toast, which is not
 * proof that it was visible (Focus Assist / Do Not Disturb can still hide it). */
export interface TestNotifyResult {
  ok: boolean;
  detail: string;
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
