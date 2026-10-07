// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 (FLW-17) server-backed sections: General/Journal/Profile (`user/settings`) and
// Notifications' feed toggles (`user/settings/notifications`). One thin fetcher/mutator per
// endpoint, same one-function-per-call shape as data/users.ts — each SCR-25 section calls only the
// fields it owns, leaving the rest of `UpdateUserSettingsParams` undefined so a save from one
// section never clobbers another's in-flight edits (mutateMultipart already skips undefined
// fields, per b-api's own `Object.entries(fields)` loop — see AGENT_LOG.md's Phase 0.3 entry).
//
// `NotificationSettingsResponse.feed` settings are a server-defined `Record<string, 0|1>`
// (b-api's own types.ts, confirmed against client.test.ts's mock fixtures) — the app has no fixed
// list of event keys to hardcode, so callers must render whatever keys the server actually
// returns rather than a hand-authored list that could drift from it.

import { getClient } from './client.js';
import { recordHttpFailure } from './httpFailureLog.js';
import type {
  UserSettingsResponse,
  UpdateUserSettingsParams,
  NotificationChannel,
} from '@b-oss/b-api';

export async function fetchUserSettings(): Promise<UserSettingsResponse> {
  const client = await getClient();
  return client.getUserSettings();
}

export async function saveUserSettings(params: UpdateUserSettingsParams): Promise<void> {
  const client = await getClient();
  await client.updateUserSettings(params);
}

// What the server last said the feed settings were, kept only to accompany a failed save in the
// http-failure record (b-oss#245).
let lastFeedRead: NotificationChannel | null = null;

export interface NotificationSettings {
  feed: NotificationChannel | null;
}

/** Only the feed group is read: the Push group is gone from Settings for good (b-oss#244) — b-push
 * now holds the app's own push-stream choice, and never reads Blipfoto's `push_*` settings. */
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const client = await getClient();
  const res = await client.getNotificationSettings({ returnFeed: true });
  lastFeedRead = res.feed ?? null;
  return { feed: lastFeedRead };
}

/** Saves feed settings only. Any `push_*`/`email_*` key is dropped defensively, so a stray key
 * can never write Blipfoto's own push/email preferences from this app (b-oss#244). */
export async function saveNotificationSettings(settings: Record<string, 0 | 1>): Promise<void> {
  const feedOnly = Object.fromEntries(
    Object.entries(settings).filter(([key]) => !/^(push|email)_/.test(key)),
  );
  const client = await getClient();
  try {
    await client.updateNotificationSettings(feedOnly);
  } catch (err) {
    await recordHttpFailure(err, { lastFeedRead });
    throw err;
  }
}
