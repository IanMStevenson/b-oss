// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { AccountConfig } from '../backend.js';
import { useApp } from '../context/AppContext.js';
import { useToast } from '../hooks/useToast.js';
import { addAccountWithToast } from '../lib/add-account-with-toast.js';

interface Props {
  account: AccountConfig;
  highlighted: boolean;
}

export const AuthErrorBanner = forwardRef<HTMLDivElement, Props>(function AuthErrorBanner(
  { account, highlighted },
  ref,
) {
  const { backend } = useApp();
  const showToast = useToast();

  return (
    <div
      ref={ref}
      style={{
        background: 'rgba(208, 69, 69, 0.09)',
        padding: '11px 24px',
        borderBottom: '1px solid rgba(208, 69, 69, 0.28)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
        animation: highlighted ? 'error-flash 0.5s ease-in-out 3' : undefined,
      }}
    >
      <AlertTriangle size={17} strokeWidth={1.7} color="var(--rag-red)" style={{ flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--rag-red)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {account.error_message}
      </div>

      <button
        onClick={() =>
          void addAccountWithToast(() => backend.reauthoriseAccount(account.id), showToast)
        }
        style={{
          flexShrink: 0,
          height: 28,
          padding: '0 12px',
          borderRadius: 6,
          background: 'var(--rag-red)',
          color: 'white',
          fontSize: 12,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Reauthorise
      </button>
    </div>
  );
});
