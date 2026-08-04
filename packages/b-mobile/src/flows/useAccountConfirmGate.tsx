// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// rules.md, "Optional: confirm the account before Star, Favourite, or a comment/reply" — scoped
// to exactly those three actions (FLW-06/FLW-07), never follow/report/hide, which already involve
// enough of a deliberate step. Off by default and inert with fewer than two accounts stored; the
// toggle to turn it on doesn't exist until SCR-25 (Phase 8) — this is the gating logic Phase 8's
// toggle will flip on, built now because FLW-06/07 require it regardless of when the toggle
// itself ships.
//
// A plain declarative IonAlert (rendered by the caller alongside its own JSX), not the
// imperative-overlay machinery OverlayProvider will eventually own — same precedent as
// WriteGuardRoute's upgrade prompt.

import { useState } from 'react';
import { IonAlert } from '@ionic/react';
import type { ReactNode } from 'react';
import { useAccountsStore } from '../state/accountsStore.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';

export interface AccountConfirmGate {
  /** Resolves `true` to proceed (having switched accounts first if the user picked a different
   * one), `false` if cancelled. A no-op resolving `true` immediately when the setting is off or
   * fewer than two accounts are stored — "with fewer than two accounts stored, the setting has no
   * effect." */
  confirmAccount: () => Promise<boolean>;
  dialog: ReactNode;
}

export function useAccountConfirmGate(): AccountConfirmGate {
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const setActiveAccountId = useAccountsStore((s) => s.setActiveAccountId);
  const confirmSetting = useDevicePrefsStore((s) => s.confirmAccountBeforeReaction);
  const [resolver, setResolver] = useState<((proceed: boolean) => void) | null>(null);

  function confirmAccount(): Promise<boolean> {
    if (!confirmSetting || accounts.length < 2) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setResolver(() => resolve));
  }

  function settle(proceed: boolean, chosenId?: string): void {
    if (proceed && chosenId && chosenId !== activeAccountId) {
      setActiveAccountId(chosenId);
    }
    resolver?.(proceed);
    setResolver(null);
  }

  const dialog = resolver ? (
    <IonAlert
      isOpen
      header="Which account?"
      inputs={accounts.map((account) => ({
        type: 'radio' as const,
        value: account.id,
        checked: account.id === activeAccountId,
        disabled: account.appTokenScope !== 'read,write',
        label:
          account.appTokenScope === 'read,write'
            ? account.username
            : `${account.username} (read-only)`,
      }))}
      buttons={[
        { text: 'Cancel', role: 'cancel', handler: () => settle(false) },
        { text: 'OK', handler: (chosenId: string) => settle(true, chosenId) },
      ]}
      onDidDismiss={() => setResolver(null)}
    />
  ) : null;

  return { confirmAccount, dialog };
}
