// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState } from 'react';
import type { AccountConfig } from '../backend.js';
import type { BackupProgress } from '../context/reducer.js';
import { Avatar } from './Avatar.js';

interface AccountRowProps {
  account: AccountConfig;
  isSelected: boolean;
  isActive: boolean;
  progress?: BackupProgress;
  compact?: boolean;
  onSelect: () => void;
}

export function AccountRow({
  account,
  isSelected,
  isActive: _isActive,
  progress,
  compact,
  onSelect,
}: AccountRowProps) {
  const archived = progress?.total_archived ?? account.total_archived;
  const [hovered, setHovered] = useState(false);

  const ragColour =
    account.rag_state === 'green'
      ? 'var(--rag-green)'
      : account.rag_state === 'amber'
        ? 'var(--rag-amber)'
        : 'var(--rag-red)';

  const showPulse = isSelected && account.rag_state === 'green';

  if (compact) {
    return (
      <button
        onClick={onSelect}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={account.journal_title}
        style={{
          width: '100%',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          borderRadius: 8,
          background: isSelected ? 'var(--green-100)' : hovered ? 'var(--green-50)' : 'transparent',
          border: isSelected ? '1px solid rgba(31,77,58,0.12)' : '1px solid transparent',
          cursor: 'pointer',
          transition: 'background 120ms',
        }}
      >
        <Avatar
          accountId={account.id}
          name={account.journal_title}
          remoteUrl={account.avatar_url}
          refreshKey={account.last_backup_at}
          size={34}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: ragColour,
            border: '2px solid white',
            animation: showPulse ? 'pulse 2s ease-in-out infinite' : 'none',
          }}
        />
      </button>
    );
  }

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        borderRadius: 8,
        background: isSelected ? 'var(--green-100)' : hovered ? 'var(--green-50)' : 'transparent',
        textAlign: 'left',
        border: isSelected ? '1px solid rgba(31,77,58,0.12)' : '1px solid transparent',
        cursor: 'pointer',
        transition: 'background 120ms',
      }}
    >
      <Avatar
        accountId={account.id}
        name={account.journal_title}
        remoteUrl={account.avatar_url}
        refreshKey={account.last_backup_at}
        size={34}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink-2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {account.journal_title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
          @{account.username}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>
          {archived.toLocaleString()} of {account.journal_entry_total.toLocaleString()} archived
        </div>
      </div>

      {/* RAG dot */}
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: ragColour,
          border: '2px solid white',
          flexShrink: 0,
          animation: showPulse ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      />
    </button>
  );
}
