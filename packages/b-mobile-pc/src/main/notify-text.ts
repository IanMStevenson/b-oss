// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The words on the OS notification. Counts only: the poller never sees comment or notification
// content, so it cannot say who commented or what on.

import type { NotifyPayload } from '../shared/notify.js';

export interface NotificationText {
  title: string;
  body: string;
}

/** The daily reminder toast. Mobile's wording, so the two platforms read the same. */
export function reminderText(accountId: string): NotificationText {
  return { title: 'Post your daily blip', body: `${accountId} hasn't published an entry today.` };
}

export function notificationText(payload: NotifyPayload, count: number): NotificationText {
  if (payload.kind === 'reauth-required') {
    return {
      title: 'b-mobile',
      body: `Sign in again to keep notifications on for ${payload.accountId}.`,
    };
  }
  const noun = payload.stream === 'comments' ? 'comment' : 'notification';
  return {
    title: 'b-mobile',
    body: `${payload.accountId}: ${count} new ${noun}${count === 1 ? '' : 's'}`,
  };
}
