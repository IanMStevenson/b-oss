// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A persistent account indicator in the primary nav chrome (Browse, Search, Map, My Profile,
// Notifications, Comments, Settings, Help), shown only when two or more accounts are stored
// (BEHAVIOUR.md, Navigation shell). With fewer than two accounts it is absent, and the space it
// occupied is simply not reserved — hence returning `null`, not a disabled/hidden element).
// Tapping it opens the account switcher (app/AccountSwitcherOverlay.tsx) via the shared overlay
// mechanism (Phase 12.1). "Informational, not a nudge" — this shows identity (avatar/icon)
// only, never a mode/upgrade badge, which is why it doesn't read `useCanWrite()` at all.

import { AccountAvatar } from './AccountAvatar.js';
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
        // 16px end gutter in total (IonButtons already contributes ~4px) — it sat ~4px from the
        // screen edge while the rest of the app uses a 16px gutter. Margin on the button, not a
        // wrapper, so nothing is reserved when this returns null.
        marginRight: 12,
        cursor: 'pointer',
        width: SIZE,
        height: SIZE,
      }}
    >
      <AccountAvatar avatarUrl={activeAccount.avatarUrl} size={SIZE} />
    </button>
  );
}
