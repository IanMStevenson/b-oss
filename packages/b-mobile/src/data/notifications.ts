// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-23/SCR-24 (FLW-15) data access and the pure logic app-architecture.md §11 describes:
// hidden-member suppression (asymmetric between the two streams — exact for comments, best-effort
// for notifications) and target resolution (where a tap should go). Kept as plain functions, not
// bundled into the screens, so the suppression/routing rules get their own direct unit tests
// (§19's "pure logic... this is where the density should be" — the same shape platform/
// mapTiles.ts and data/imageCrop.ts already established).

import { getClient } from './client.js';
import type { BlipComment, BlipNotification } from '@b-oss/b-api';

export interface UnreadTotals {
  comments: number;
  notifications: number;
}

/** The one side-effect-free read on either stream (endpoints.md) — safe to call any time,
 * including to snapshot "how many were unread" *before* triggering a fetch that would mark them
 * read (app-architecture.md §11's first-page-unread-snapshot trap, and FLW-15 step 2's "unread
 * total is a server figure"). */
export async function fetchUnreadTotals(): Promise<UnreadTotals> {
  const client = await getClient();
  const result = await client.getUnreadTotals({ returnComments: true, returnNotifications: true });
  return { comments: result.comments ?? 0, notifications: result.notifications ?? 0 };
}

/** SCR-23 — fetching this *is* what marks the returned items read (endpoints.md); there is no
 * separate call. `sinceId` drives pull-to-refresh (FLW-15 step 1's "use a real cursor so only new
 * items are fetched"). */
export async function fetchRecentNotifications(sinceId?: string): Promise<BlipNotification[]> {
  const client = await getClient();
  const result = await client.getRecentNotifications({ sinceId });
  return result.notifications;
}

/** SCR-24 — fetching this marks *every* unread comment read, not only what's returned
 * (endpoints.md's "Comments — fetching clears every unread comment for the account"). */
export async function fetchRecentComments(sinceId?: string): Promise<BlipComment[]> {
  const client = await getClient();
  const result = await client.getRecentComments({ sinceId });
  return result.comments;
}

// ── SCR-23 hidden-member suppression + target resolution (app-architecture.md §11) ────────────

const RESERVED_PATH_SEGMENTS = new Set(['entry', 'me', 'store', '_assets']);
const FOLLOW_REQUEST_PATH = 'me/followers/requests';

/** Every `href="..."` value inside a notification's `content_html` — the only place the actor
 * responsible for a notification is identifiable at all (SCR-23: "the member responsible appears
 * only within that text, as a link to their profile"). A plain regex scan, not a DOM parse — this
 * never touches innerHTML/the DOM, so it doesn't reopen the dangerouslySetInnerHTML question §14
 * already closed; the HTML is read as text, never rendered. */
function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    hrefs.push(match[1]);
  }
  return hrefs;
}

/** The path segment(s) after the host, lowercased, with a leading/trailing slash stripped — works
 * for both an absolute `https://www.blipfoto.com/...` URL and a bare relative `/...` path, since
 * `content_html`'s links aren't guaranteed to be one shape or the other. */
function pathOf(href: string): string {
  try {
    const url = new URL(href, 'https://www.blipfoto.com');
    return url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  } catch {
    return href.replace(/^\/+|\/+$/g, '').toLowerCase();
  }
}

/** SCR-23's own heuristic, stated plainly as a safety feature there: a single-segment path not in
 * the reserved set is treated as a candidate username. Best-effort, not guaranteed — see the
 * screen spec for why. */
export function candidateActorsFromNotification(notification: BlipNotification): string[] {
  const actors = new Set<string>();
  for (const href of extractHrefs(notification.content_html)) {
    const path = pathOf(href);
    if (!path || path.includes('/')) continue;
    if (RESERVED_PATH_SEGMENTS.has(path)) continue;
    actors.add(path);
  }
  return [...actors];
}

/** Suppresses a notification wherever a candidate actor is recognised as hidden — best-effort by
 * construction (see `candidateActorsFromNotification`), never guaranteed. */
export function isNotificationFromHiddenMember(
  notification: BlipNotification,
  hiddenUsernames: readonly string[],
): boolean {
  if (hiddenUsernames.length === 0) return false;
  return candidateActorsFromNotification(notification).some((actor) =>
    hiddenUsernames.includes(actor),
  );
}

export type NotificationTarget =
  | { kind: 'entry'; entryId: string }
  | { kind: 'profile'; username: string }
  | { kind: 'follow-request' }
  | { kind: 'external'; url: string };

/** SCR-23's tap routing, in the order the spec states it: follow-request first (a hardcoded
 * server-side path inside `content_html`, "a far more robust signal than username parsing"),
 * then `link_url`'s own entry/profile shape, else the link opens externally. */
export function resolveNotificationTarget(notification: BlipNotification): NotificationTarget {
  const isFollowRequest = extractHrefs(notification.content_html).some(
    (href) => pathOf(href) === FOLLOW_REQUEST_PATH,
  );
  if (isFollowRequest) return { kind: 'follow-request' };

  const linkPath = pathOf(notification.link_url);
  const entryMatch = /^entry\/([^/]+)/.exec(linkPath);
  if (entryMatch) return { kind: 'entry', entryId: entryMatch[1] };

  if (linkPath && !linkPath.includes('/') && !RESERVED_PATH_SEGMENTS.has(linkPath)) {
    return { kind: 'profile', username: linkPath };
  }

  return { kind: 'external', url: notification.link_url };
}

// ── SCR-24 first-page-unread-snapshot (app-architecture.md §11) ───────────────────────────────

/** The comments-inbox trap, made explicit as a function rather than left as an inline
 * `.filter(c => c.unread === 1)` at each call site: only the **first** `messages/comments/recent`
 * response in a session has meaningful `unread` flags — every later page/refresh will show
 * everything as already read, because the first fetch cleared all of it server-side. Callers must
 * capture this once (e.g. into a `Set<string>` of comment ids) and never recompute it from a
 * later response. */
export function unreadCommentIds(firstResponseComments: readonly BlipComment[]): Set<string> {
  return new Set(firstResponseComments.filter((c) => c.unread === 1).map((c) => c.comment_id_str));
}
