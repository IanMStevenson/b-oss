// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Archive, Shield } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { useToast } from '../../hooks/useToast.js';
import { SplitButton } from '../SplitButton.js';
import { addAccountWithToast } from '../../lib/add-account-with-toast.js';

export function FirstOpenScreen() {
  const { backend } = useApp();
  const showToast = useToast();

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 0,
        }}
      >
        {/* Icon badge */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'var(--green-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          <Archive size={28} strokeWidth={1.6} color="var(--green-800)" />
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.015em',
            color: 'var(--ink)',
            marginBottom: 12,
          }}
        >
          Welcome to b-ark
        </h1>

        <p
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            lineHeight: 1.6,
            marginBottom: 28,
          }}
        >
          b-ark keeps a local backup of your Blipfoto journals — photos, captions, comments,
          metadata — written to disk in folders you control.
        </p>

        <div style={{ width: '100%', marginBottom: 16 }}>
          <SplitButton
            primaryLabel="+ Add account"
            onPrimary={() => {
              void addAccountWithToast(() => backend.addAccount(), showToast);
            }}
            menu={[
              {
                label: 'Force new sign-in…',
                onSelect: () => {
                  void addAccountWithToast(() => backend.addAccountFresh(), showToast);
                },
              },
            ]}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--muted)',
            fontSize: 12,
          }}
        >
          <Shield size={13} strokeWidth={1.6} />
          <span>You&rsquo;ll be taken to Blipfoto to authorise access in your browser.</span>
        </div>
      </div>
    </div>
  );
}
