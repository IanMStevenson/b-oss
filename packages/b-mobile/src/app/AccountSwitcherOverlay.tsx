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
// A NeedsReauthError (FLW-21's existing case, switchAccount() throws it synchronously) is handled
// by closing the popover and sending the user to SCR-30, which already has the real
// re-authorize-or-cancel prompt — not duplicated here for a lightweight overlay.

import { IonButton, IonBadge } from '@ionic/react';
import { CachedImage } from '../components/CachedImage.js';
import { useAccountsStore } from '../state/accountsStore.js';
import type { StoredAccount } from '../state/accountsStore.js';
import { switchAccount, NeedsReauthError } from '../flows/accountsFlow.js';
import { modeLabel } from '../screens/SCR-30-accounts/AccountsScreen.js';
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
    try {
      switchAccount(account.id);
      onDismiss();
    } catch (err) {
      if (err instanceof NeedsReauthError) {
        onDismiss();
        navigate.push('/accounts');
        return;
      }
      throw err;
    }
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
          top: 52,
          right: 8,
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
        {accounts.map((account) => (
          <button
            key={account.id}
            role="menuitem"
            onClick={() => handleTap(account)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              background: 'none',
              border: 'none',
              padding: '8px 4px',
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            {account.avatarUrl ? (
              <CachedImage
                src={account.avatarUrl}
                alt=""
                style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--green-800, #1f4d3a)',
                  color: '#fff',
                  fontSize: '0.75rem',
                  flexShrink: 0,
                }}
              >
                {account.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span style={{ flex: 1 }}>
              {account.username}
              {account.id === activeAccountId && <IonBadge color="success"> active</IonBadge>}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{modeLabel(account)}</span>
          </button>
        ))}
        <IonButton expand="block" fill="clear" onClick={openManageAccounts}>
          Manage accounts
        </IonButton>
      </div>
    </>
  );
}
