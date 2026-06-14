// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The account header bar shared by the desktop (HomeScreen) and extension (BackupPage) shells:
// avatar (with an optional RAG status dot), the title + "@username · since <date> · N entries"
// meta line, and an actions slot the shell fills with IconButton/BackupButton. Differences
// between the two shells are a handful of props (avatar node/size, status dot, container metrics).

import type { ReactNode } from 'react';

function formatSince(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export interface AccountHeaderBarProps {
  /** The shell's own configured <Avatar> (each has a different avatar data source). */
  avatar: ReactNode;
  /** Avatar pixel size — also sizes the status dot. */
  avatarSize: number;
  /** RAG colour for the status dot overlay; omit for no dot (desktop). */
  statusDotColour?: string;
  title: string;
  titleFontSize?: number;
  username: string;
  /** True once the journal has loaded — gates the "since · entries" meta. */
  metaReady: boolean;
  /** ISO date of the earliest entry, or null when there are no entries yet. */
  sinceDate: string | null;
  entryTotal: number;
  /** Shell-composed action buttons (IconButton / BackupButton). */
  actions: ReactNode;
  padding?: string;
  gap?: number;
  background?: string;
}

export function AccountHeaderBar({
  avatar,
  avatarSize,
  statusDotColour,
  title,
  titleFontSize = 16,
  username,
  metaReady,
  sinceDate,
  entryTotal,
  actions,
  padding = '14px 14px 12px',
  gap = 12,
  background,
}: AccountHeaderBarProps) {
  const dotSize = Math.round(avatarSize * 0.36); // 56 → 20, 40 → 14

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding,
        gap,
        borderBottom: '1px solid var(--line)',
        flexShrink: 0,
        ...(background ? { background } : {}),
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {avatar}
        {statusDotColour && (
          <div
            style={{
              position: 'absolute',
              bottom: 1,
              right: 1,
              width: dotSize,
              height: dotSize,
              borderRadius: '50%',
              background: statusDotColour,
              border: '1px solid white',
            }}
          />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          @{username}
          {metaReady && (
            <>
              {' · since '}
              {sinceDate ? formatSince(sinceDate) : '—'}
              {' · '}
              {entryTotal.toLocaleString()} entries
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{actions}</div>
    </div>
  );
}
