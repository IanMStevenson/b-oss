// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The entry page's author block (b-oss#174): square avatar, the journal's name in a light weight,
// "By <user>", and a follow icon beside it — Blipfoto's own entry-page header. App-only: b-view
// exposes a `header` slot and this fills it; the shared viewer has no such concept (a backup is
// one person's journal, and there's nobody to follow).
//
// Tapping the avatar or name opens the author's profile. The follow control replaces the
// Follow / Unfollow / "Request sent" buttons that used to sit below the entry.

import { UserPlus, UserCheck, Clock } from 'lucide-react';
import { CachedImage } from './CachedImage.js';

/** `null`: the follow control isn't offered (own entry, read-only account). */
export type FollowControl = 'follow' | 'following' | 'requested' | null;

interface EntryAuthorBlockProps {
  username: string;
  /** The journal's title; falls back to the username when blank. */
  journalTitle: string;
  avatarUrl: string | null;
  follow: FollowControl;
  onFollow: () => void;
  /** Asks to unfollow — the screen confirms before anything happens. */
  onUnfollow: () => void;
  onOpenProfile: () => void;
}

const AVATAR_SIZE = 50;

export function EntryAuthorBlock({
  username,
  journalTitle,
  avatarUrl,
  follow,
  onFollow,
  onUnfollow,
  onOpenProfile,
}: EntryAuthorBlockProps) {
  const title = journalTitle.trim() || username;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, maxWidth: '100%' }}>
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label={`${username}’s profile`}
        style={{
          flex: `0 0 ${AVATAR_SIZE}px`,
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          padding: 0,
          border: '1px solid var(--line)',
          background: 'var(--photo-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {avatarUrl ? (
          <CachedImage
            src={avatarUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              fontSize: 'var(--text-xl, 22px)',
              fontWeight: 300,
              color: 'var(--muted)',
              textTransform: 'uppercase',
            }}
          >
            {username.charAt(0)}
          </span>
        )}
      </button>

      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          onClick={onOpenProfile}
          style={{
            display: 'block',
            maxWidth: '100%',
            padding: 0,
            textAlign: 'left',
            font: 'inherit',
            fontSize: 'var(--text-xl, 22px)',
            fontWeight: 'var(--font-weight-light, 300)',
            lineHeight: 'var(--leading-tight, 1.25)',
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--text-sm, 13px)',
            color: 'var(--ink-2)',
          }}
        >
          <span>By {username}</span>
          {follow === 'follow' && (
            <button
              type="button"
              onClick={onFollow}
              aria-label={`Follow ${username}`}
              style={iconButtonStyle}
            >
              <UserPlus size={18} strokeWidth={1.8} />
            </button>
          )}
          {follow === 'following' && (
            <button
              type="button"
              onClick={onUnfollow}
              aria-label={`Following ${username} — unfollow`}
              style={iconButtonStyle}
            >
              <UserCheck size={18} strokeWidth={1.8} />
            </button>
          )}
          {follow === 'requested' && (
            <span
              role="img"
              aria-label="Follow request sent"
              style={{ ...iconButtonStyle, color: 'var(--muted)' }}
            >
              <Clock size={18} strokeWidth={1.8} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const iconButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: 4,
  color: 'var(--green-700)',
} as const;
