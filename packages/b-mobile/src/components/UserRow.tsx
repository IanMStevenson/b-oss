// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A person row (avatar + username) for SCR-19/20/21's paged lists. Per rules.md ("Their name and
// avatar remain visible in people lists... marked Hidden"), a hidden member is NOT suppressed
// here the way a grid tile or comment is — removing them would make them impossible to find in
// order to unhide. `children` is the row's action slot (Remove follower / Approve+Refuse / Allow),
// since that varies per screen.

import type { ReactNode } from 'react';
import { InboxRow, RowAvatar } from './InboxRow.js';
import { UserBadges } from './UserBadges.js';
import { useIsHidden } from '../state/hiddenMembersStore.js';
import type { BlipUser } from '@b-oss/b-api';

interface UserRowProps {
  user: BlipUser;
  onTap: () => void;
  children?: ReactNode;
}

export function UserRow({ user, onTap, children }: UserRowProps) {
  const hidden = useIsHidden(user.username);
  return (
    <InboxRow actions={children}>
      <button
        onClick={onTap}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          background: 'none',
          border: 'none',
          font: 'inherit',
          textAlign: 'left',
          padding: 0,
        }}
      >
        <RowAvatar src={user.avatar_url} />
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 0,
            fontSize: 16,
          }}
        >
          {user.username}
          <UserBadges icons={user.icons} size={14} />
          {hidden && <span style={{ color: 'var(--muted)' }}>(Hidden)</span>}
        </span>
      </button>
    </InboxRow>
  );
}
