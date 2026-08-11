// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pure-logic coverage for the SCR-23 hidden-member heuristic / target resolution and SCR-24's
// first-page-unread-snapshot helper (§19: "this is where the density should be").

import { describe, it, expect } from 'vitest';
import {
  candidateActorsFromNotification,
  isNotificationFromHiddenMember,
  resolveNotificationTarget,
  unreadCommentIds,
} from '../notifications.js';
import type { BlipComment, BlipNotification } from '@b-oss/b-api';

function notification(overrides: Partial<BlipNotification> = {}): BlipNotification {
  return {
    notification_id_str: '1',
    content: 'alice started following you',
    content_html: '<p><a href="https://www.blipfoto.com/alice">alice</a> started following you</p>',
    image_url: 'https://example.com/avatar.jpg',
    link_url: 'https://www.blipfoto.com/alice',
    ...overrides,
  };
}

describe('candidateActorsFromNotification', () => {
  it('extracts a single-segment username from an href', () => {
    expect(candidateActorsFromNotification(notification())).toEqual(['alice']);
  });

  it('excludes reserved path segments', () => {
    for (const reserved of ['entry', 'me', 'store', '_assets']) {
      const n = notification({
        content_html: `<a href="https://www.blipfoto.com/${reserved}">link</a>`,
      });
      expect(candidateActorsFromNotification(n)).toEqual([]);
    }
  });

  it('ignores multi-segment paths (not a candidate username)', () => {
    const n = notification({
      content_html: '<a href="https://www.blipfoto.com/entry/12345">your entry</a>',
    });
    expect(candidateActorsFromNotification(n)).toEqual([]);
  });

  it('returns an empty list when there is no actor at all (award/announcement)', () => {
    const n = notification({
      content_html: '<p>You earned the "100 days" award!</p>',
      link_url: 'https://www.blipfoto.com/me/awards',
    });
    expect(candidateActorsFromNotification(n)).toEqual([]);
  });

  it('de-duplicates repeated actor links', () => {
    const n = notification({
      content_html:
        '<a href="https://www.blipfoto.com/alice">alice</a> replied to <a href="https://www.blipfoto.com/alice">alice</a>',
    });
    expect(candidateActorsFromNotification(n)).toEqual(['alice']);
  });

  it('handles a bare relative href (no scheme/host)', () => {
    const n = notification({ content_html: '<a href="/bob">bob</a>' });
    expect(candidateActorsFromNotification(n)).toEqual(['bob']);
  });
});

describe('isNotificationFromHiddenMember', () => {
  it('suppresses when a candidate actor is hidden', () => {
    expect(isNotificationFromHiddenMember(notification(), ['alice'])).toBe(true);
  });

  it('does not suppress when no candidate actor is hidden', () => {
    expect(isNotificationFromHiddenMember(notification(), ['someone-else'])).toBe(false);
  });

  it('never suppresses a notification with no actor at all', () => {
    const n = notification({ content_html: '<p>Platform announcement</p>' });
    expect(isNotificationFromHiddenMember(n, ['alice'])).toBe(false);
  });

  it('short-circuits cleanly on an empty hidden list', () => {
    expect(isNotificationFromHiddenMember(notification(), [])).toBe(false);
  });
});

describe('resolveNotificationTarget', () => {
  it('resolves an entry link', () => {
    const n = notification({ link_url: 'https://www.blipfoto.com/entry/998877' });
    expect(resolveNotificationTarget(n)).toEqual({ kind: 'entry', entryId: '998877' });
  });

  it('resolves a profile link', () => {
    const n = notification({ link_url: 'https://www.blipfoto.com/alice' });
    expect(resolveNotificationTarget(n)).toEqual({ kind: 'profile', username: 'alice' });
  });

  it('detects a follow-request notification via the hardcoded internal path, even though link_url points at the requester', () => {
    const n = notification({
      content_html:
        '<a href="https://www.blipfoto.com/alice">alice</a> wants to follow you — <a href="https://www.blipfoto.com/me/followers/requests">respond</a>',
      link_url: 'https://www.blipfoto.com/alice',
    });
    expect(resolveNotificationTarget(n)).toEqual({ kind: 'follow-request' });
  });

  it('falls back to external for an unrecognised target (award/announcement)', () => {
    const n = notification({
      content_html: '<p>You earned an award</p>',
      link_url: 'https://www.blipfoto.com/awards/some-award',
    });
    expect(resolveNotificationTarget(n)).toEqual({
      kind: 'external',
      url: 'https://www.blipfoto.com/awards/some-award',
    });
  });

  it('follow-request detection takes priority over an entry/profile-shaped link_url', () => {
    const n = notification({
      content_html: '<a href="https://www.blipfoto.com/me/followers/requests">respond</a>',
      link_url: 'https://www.blipfoto.com/entry/1', // should be ignored in favour of follow-request
    });
    expect(resolveNotificationTarget(n)).toEqual({ kind: 'follow-request' });
  });
});

function comment(overrides: Partial<BlipComment> = {}): BlipComment {
  return {
    comment_id_str: '1',
    parent_id_str: null,
    entry_id_str: '100',
    thumbnail_url: 'https://example.com/thumb.jpg',
    content: 'lovely light!',
    content_html: '<p>lovely light!</p>',
    commenter: { username: 'alice', avatar_url: 'https://example.com/avatar.jpg', icons: [] },
    actions: { reply: 1, edit: 0, delete: 1 },
    replies: null,
    ...overrides,
  };
}

describe('unreadCommentIds', () => {
  it('captures ids flagged unread in the given response', () => {
    const ids = unreadCommentIds([
      comment({ comment_id_str: '1', unread: 1 }),
      comment({ comment_id_str: '2', unread: 0 }),
      comment({ comment_id_str: '3', unread: 1 }),
    ]);
    expect(ids).toEqual(new Set(['1', '3']));
  });

  it('treats a missing unread flag as read', () => {
    const ids = unreadCommentIds([comment({ comment_id_str: '1' })]);
    expect(ids.size).toBe(0);
  });

  it('is empty for an empty response', () => {
    expect(unreadCommentIds([]).size).toBe(0);
  });
});
