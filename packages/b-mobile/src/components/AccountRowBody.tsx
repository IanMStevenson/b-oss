// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one way an account is presented (UX review X10): avatar, username, mode line ("Read-write" /
// "Read-only" / red "Needs sign-in") and a green tick on the active account. Shared by the header
// switcher (a row button), the Accounts screen (a list item) and the drawer's account block, so
// the three can't drift apart again. `children` is extra content under the mode line (the
// Accounts screen's notification status and sign-in actions); `trailing` replaces the tick.

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { AccountAvatar } from './AccountAvatar.js';
import type { StoredAccount } from '../state/accountsStore.js';
import { modeLabel, NEEDS_SIGN_IN_STYLE } from './accountPresentation.js';

export function AccountRowBody({
  account,
  active,
  avatarSize = 32,
  trailing,
  children,
}: {
  account: StoredAccount;
  active: boolean;
  avatarSize?: number;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const needsReauth = account.appTokenScope === null;
  return (
    <>
      <AccountAvatar avatarUrl={account.avatarUrl} size={avatarSize} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: active ? 600 : undefined }}>
          {account.username}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: '0.8rem',
            ...(needsReauth ? NEEDS_SIGN_IN_STYLE : { color: 'var(--muted)' }),
          }}
        >
          {modeLabel(account)}
        </span>
        {children}
      </span>
      {trailing ??
        (active && (
          <Check
            size={18}
            strokeWidth={2}
            aria-label="Active account"
            style={{ color: 'var(--green-800, #1f4d3a)', flexShrink: 0 }}
          />
        ))}
    </>
  );
}
