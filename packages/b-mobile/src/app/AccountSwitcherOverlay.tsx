// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// rules.md, "Multi-account clarity" — "a popover/sheet listing every stored account (avatar,
// username, mode, needs-reauth badge where relevant)... Tapping an inactive account switches to
// it instantly, per FLW-21 — the same underlying mechanism SCR-30 uses, just reachable from
// anywhere. A Manage accounts row at the bottom opens SCR-30... This popover is not a new screen
// ID; it's a transient overlay over whatever screen is currently showing."
//
// A plain fixed-position panel + backdrop, not IonPopover — the same choice OverlayProvider's
// first-run explainer made (IonModal threw "framework delegate is missing" in this jsdom setup;
// IonPopover's own overlay-controller plumbing is the same family of component, untested here,
// and not worth the risk given a plain div already works). "Anchored where it was tapped" is
// satisfied loosely (top-right, near where the indicator itself sits in every toolbar it appears
// in per rules.md), not via pixel-tracking the tap coordinates — the spec's point is "doesn't
// navigate away", not literal cursor-following.
//
// A needs-reauth account (its app token died) is shown in red, "Needs sign-in" (b-oss#263).
// Picking it — or a NeedsReauthError from switchAccount(), FLW-21's existing case — closes the
// popover and opens SCR-30 as `/accounts?reauth=<id>`, which shows the one "{username} needs to sign
// in again" dialog every entry point shares; not duplicated here for a lightweight overlay.

import { IonButton } from '@ionic/react';
import { Check } from 'lucide-react';
import { AccountAvatar } from '../components/AccountAvatar.js';
import { useAccountsStore } from '../state/accountsStore.js';
import type { StoredAccount } from '../state/accountsStore.js';
import { switchAccount, NeedsReauthError } from '../flows/accountsFlow.js';
import { modeLabel, NEEDS_SIGN_IN_STYLE } from '../screens/SCR-30-accounts/AccountsScreen.js';
import { useAppNavigate } from './routes/useAppNavigate.js';

export function AccountSwitcherOverlay({ onDismiss }: { onDismiss: () => void }) {
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const navigate = useAppNavigate();

  function handleTap(account: StoredAccount): void {
    if (account.id === activeAccountId) {
      onDismiss();
      return;
    }
    if (account.appTokenScope === null) {
      openReauth(account.id);
      return;
    }
    try {
      switchAccount(account.id);
      onDismiss();
    } catch (err) {
      if (err instanceof NeedsReauthError) {
        openReauth(account.id);
        return;
      }
      throw err;
    }
  }

  function openReauth(accountId: string): void {
    onDismiss();
    navigate.push(`/accounts?reauth=${encodeURIComponent(accountId)}`);
  }

  function openManageAccounts(): void {
    onDismiss();
    navigate.push('/accounts');
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onDismiss}
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
      />
      <div
        role="menu"
        aria-label="Switch account"
        style={{
          position: 'fixed',
          // Just under the header — which itself sits below the status bar, so the inset has to be
          // added or this overlaps the header's bottom edge (b-oss#165 safe-area audit).
          top: 'calc(52px + var(--ion-safe-area-top, 0px))',
          right: 'calc(8px + var(--ion-safe-area-right, 0px))',
          zIndex: 1000,
          minWidth: 240,
          maxWidth: '85vw',
          background: 'var(--bg, #fff)',
          border: '1px solid var(--line, #e5e7eb)',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          padding: 8,
        }}
      >
        {accounts.map((account) => {
          const active = account.id === activeAccountId;
          const needsReauth = account.appTokenScope === null;
          return (
            <button
              key={account.id}
              role="menuitemradio"
              aria-checked={active}
              onClick={() => handleTap(account)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                // The active account is a whole-row pale-green highlight plus a tick at the end
                // (single-select), not a badge.
                background: active ? 'var(--green-100, #eef2ee)' : 'none',
                border: 'none',
                borderRadius: 8,
                padding: '8px 10px',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <AccountAvatar avatarUrl={account.avatarUrl} size={32} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block' }}>{account.username}</span>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    ...(needsReauth ? NEEDS_SIGN_IN_STYLE : { color: 'var(--muted)' }),
                  }}
                >
                  {modeLabel(account)}
                </span>
              </span>
              {active && (
                <Check
                  size={18}
                  strokeWidth={2}
                  aria-label="Active account"
                  style={{ color: 'var(--green-800, #1f4d3a)', flexShrink: 0 }}
                />
              )}
            </button>
          );
        })}
        <IonButton expand="block" fill="clear" onClick={openManageAccounts}>
          Manage accounts
        </IonButton>
      </div>
    </>
  );
}
