// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { FolderOpen } from 'lucide-react';
import type { AccountConfig } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';

interface EmptyAccountScreenProps {
  account: AccountConfig;
}

export function EmptyAccountScreen({ account }: EmptyAccountScreenProps) {
  const { dispatch, backend } = useApp();

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
        }}
      >
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
          <FolderOpen size={28} strokeWidth={1.6} color="var(--green-800)" />
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.015em',
            marginBottom: 12,
          }}
        >
          No blips archived yet
        </h1>

        <p
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            lineHeight: 1.6,
            marginBottom: 28,
          }}
        >
          You&rsquo;re set up. Run your first backup to pull every entry from Blipfoto into{' '}
          <code
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 11.5,
              background: 'var(--green-50)',
              padding: '1px 4px',
              borderRadius: 3,
            }}
          >
            {account.backup_folder || 'your backup folder'}
          </code>
          . You can leave b-ark running and it will follow your schedule.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => dispatch({ type: 'panel:open', panel: 'settings' })}
            style={{
              height: 30,
              padding: '0 16px',
              borderRadius: 7,
              border: '1px solid var(--line)',
              background: 'white',
              color: 'var(--ink-2)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Review settings
          </button>
          <button
            onClick={() => {
              void backend.startBackup(account.id);
            }}
            style={{
              height: 30,
              padding: '0 16px',
              borderRadius: 7,
              background: 'var(--green-800)',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--green-700)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--green-800)';
            }}
          >
            Run first backup
          </button>
        </div>
      </div>
    </div>
  );
}
