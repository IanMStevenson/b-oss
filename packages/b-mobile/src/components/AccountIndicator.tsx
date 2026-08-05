// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// rules.md, "Multi-account clarity" — a persistent account indicator in the primary nav chrome
// (Browse, Search, Map, My Profile, Notifications, Comments, Settings, Help), shown only when two
// or more accounts are stored ("with fewer than two accounts it is absent, and the space it
// occupied is simply not reserved" — hence returning `null`, not a disabled/hidden element).
// Tapping it opens the account switcher (app/AccountSwitcherOverlay.tsx) via the shared overlay
// mechanism (Phase 12.1). "Informational, not a nudge" — this shows identity (avatar/initial)
// only, never a mode/upgrade badge, which is why it doesn't read `useCanWrite()` at all.

import { CachedImage } from './CachedImage.js';
import { useAccountsStore, useActiveAccount } from '../state/accountsStore.js';
import { useOverlay } from '../app/OverlayProvider.js';

const SIZE = 28;

export function AccountIndicator() {
  const accountCount = useAccountsStore((s) => s.accounts.length);
  const activeAccount = useActiveAccount();
  const { showAccountSwitcher } = useOverlay();

  if (accountCount < 2 || !activeAccount) return null;

  return (
    <button
      onClick={showAccountSwitcher}
      aria-label={`Switch account (currently ${activeAccount.username})`}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        width: SIZE,
        height: SIZE,
      }}
    >
      {activeAccount.avatarUrl ? (
        <CachedImage
          src={activeAccount.avatarUrl}
          alt=""
          style={{ width: SIZE, height: SIZE, borderRadius: '50%' }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: SIZE,
            height: SIZE,
            borderRadius: '50%',
            background: 'var(--green-800, #1f4d3a)',
            color: '#fff',
            fontSize: '0.75rem',
          }}
        >
          {activeAccount.username.slice(0, 1).toUpperCase()}
        </span>
      )}
    </button>
  );
}
