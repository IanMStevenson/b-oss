// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { AccountConfig } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';

interface OAuthSuccessScreenProps {
  account: AccountConfig;
}

function AvatarWithFallback({ url, name, size }: { url: string; name: string; size: number }) {
  const [error, setError] = useState(false);
  const initial = (name[0] ?? '?').toUpperCase();
  const colours = ['#1f4d3a', '#2a6347', '#22a06b', '#2f6fd1'];
  const colour = colours[name.charCodeAt(0) % colours.length] ?? '#1f4d3a';

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: colour,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: size * 0.4,
          fontWeight: 600,
        }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      style={{ borderRadius: '50%', objectFit: 'cover' }}
      onError={() => setError(true)}
    />
  );
}

export function OAuthSuccessScreen({ account }: OAuthSuccessScreenProps) {
  const { dispatch, backend } = useApp();

  function reviewSettings() {
    dispatch({ type: 'account:select', id: account.id });
    dispatch({ type: 'just_connected:clear' });
    dispatch({ type: 'panel:open', panel: 'settings' });
  }

  function runFirstBackup() {
    dispatch({ type: 'account:select', id: account.id });
    dispatch({ type: 'just_connected:clear' });
    void backend.startBackup(account.id);
  }

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
        {/* Green check badge */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--rag-green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
            boxShadow: '0 6px 18px rgba(34,160,107,0.28)',
          }}
        >
          <Check size={28} strokeWidth={2.5} color="white" />
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.015em',
            marginBottom: 10,
          }}
        >
          Account connected
        </h1>

        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
          b-ark has access to read your journal.
        </p>

        {/* Profile card */}
        <div
          style={{
            width: '100%',
            background: 'var(--green-50)',
            borderRadius: 12,
            padding: 22,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            textAlign: 'left',
            marginBottom: 24,
          }}
        >
          <AvatarWithFallback url={account.avatar_url} name={account.journal_title} size={64} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{account.journal_title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
              @{account.username}
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                {account.journal_entry_total.toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--muted)',
                  marginLeft: 4,
                }}
              >
                entries
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={reviewSettings}
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
            onClick={runFirstBackup}
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
