// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A person row (avatar + username) for SCR-19/20/21's paged lists. Per rules.md ("Their name and
// avatar remain visible in people lists... marked Hidden"), a hidden member is NOT suppressed
// here the way a grid tile or comment is — removing them would make them impossible to find in
// order to unhide. `children` is the row's action slot (Remove follower / Approve+Refuse / Allow),
// since that varies per screen.

import type { ReactNode } from 'react';
import { IonItem } from '@ionic/react';
import { CachedImage } from './CachedImage.js';
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
    <IonItem>
      <button
        onClick={onTap}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 1,
          background: 'none',
          border: 'none',
          font: 'inherit',
          textAlign: 'left',
          padding: '8px 0',
        }}
      >
        <CachedImage
          src={user.avatar_url}
          alt=""
          className="avatar"
          style={{ width: 32, height: 32, borderRadius: '50%' }}
        />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {user.username}
          <UserBadges icons={user.icons} size={14} />
          {hidden && <span style={{ color: 'var(--muted)' }}>(Hidden)</span>}
        </span>
      </button>
      {children}
    </IonItem>
  );
}
