// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Search } from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { useToast } from '../hooks/useToast.js';
import { addAccountWithToast } from '../lib/add-account-with-toast.js';
import { AccountRow } from './AccountRow.js';
import { SplitButton } from './SplitButton.js';

export function Sidebar() {
  const { state, dispatch, backend } = useApp();
  const showToast = useToast();
  const { store, selectedAccountId, panel, backupProgress } = state;

  if (!store) return null;

  const orderedAccounts = [...store.accounts].sort((a, b) => {
    const ai = store.ui.accountOrder.indexOf(a.id);
    const bi = store.ui.accountOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const disabled = panel !== null;

  return (
    <div
      style={{
        width: 268,
        flexShrink: 0,
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 14px 8px',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--muted)',
          }}
        >
          Accounts
        </span>
        <button
          aria-label="Search accounts"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 6,
            color: 'var(--muted)',
          }}
        >
          <Search size={14} strokeWidth={1.6} />
        </button>
      </div>

      {/* Account list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 8px',
          opacity: disabled ? 0.45 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          transition: 'opacity 150ms',
        }}
      >
        {orderedAccounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            isSelected={account.id === selectedAccountId}
            isActive={backupProgress[account.id]?.running === true}
            progress={backupProgress[account.id]}
            onSelect={() => dispatch({ type: 'account:select', id: account.id })}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 8px 12px' }}>
        <SplitButton
          variant="secondary"
          primaryLabel="+ Add account…"
          onPrimary={() => {
            void addAccountWithToast(() => backend.addAccount(), showToast);
          }}
          menu={[
            {
              label: 'Sign in with a different account…',
              onSelect: () => {
                void addAccountWithToast(() => backend.addAccountFresh(), showToast);
              },
            },
          ]}
        />
      </div>
    </div>
  );
}
