// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { AccountConfig } from '../backend.js';
import type { BackupProgress } from '../context/reducer.js';

interface AccountRowProps {
  account: AccountConfig;
  isSelected: boolean;
  isActive: boolean;
  progress?: BackupProgress;
  onSelect: () => void;
}

function AvatarBadge({ url, name, size }: { url: string; name: string; size: number }) {
  const [error, setError] = useState(false);
  const initial = (name[0] ?? '?').toUpperCase();

  const colours = ['#1f4d3a', '#2a6347', '#22a06b', '#2f6fd1', '#9333ea'];
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
          flexShrink: 0,
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
      style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      onError={() => setError(true)}
    />
  );
}

export function AccountRow({
  account,
  isSelected,
  isActive: _isActive,
  progress: _progress,
  onSelect,
}: AccountRowProps) {
  const [hovered, setHovered] = useState(false);

  const ragColour =
    account.rag_state === 'green'
      ? 'var(--rag-green)'
      : account.rag_state === 'amber'
        ? 'var(--rag-amber)'
        : 'var(--rag-red)';

  const showPulse = isSelected && account.rag_state === 'green';

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
      {/* Drag handle — visible on hover only */}
      <div
        style={{
          opacity: hovered ? 1 : 0,
          color: 'var(--muted-2)',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          cursor: 'grab',
        }}
        aria-hidden="true"
      >
        <GripVertical size={14} strokeWidth={1.6} />
      </div>

      <AvatarBadge url={account.avatar_url} name={account.journal_title} size={34} />

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
      </div>

      {/* RAG dot */}
      <div
        style={{
          width: 9,
          height: 9,
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
