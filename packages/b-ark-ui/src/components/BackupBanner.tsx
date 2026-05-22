// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { RefreshCw } from 'lucide-react';
import type { BackupProgress } from '../context/reducer.js';

interface BackupBannerProps {
  journalTitle: string;
  backupFolder: string;
  progress: BackupProgress;
}

export function BackupBanner({ journalTitle, backupFolder, progress }: BackupBannerProps) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      style={{
        background: 'var(--green-100)',
        padding: '12px 24px',
        borderBottom: '1px solid rgba(31,77,58,0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexShrink: 0,
      }}
    >
      <RefreshCw
        size={18}
        strokeWidth={1.6}
        color="var(--green-800)"
        style={{ animation: 'spin 1.2s linear infinite', flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-900)' }}>
          Backing up &ldquo;{journalTitle}&rdquo;
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
          Writing entries to{' '}
          <span style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
            {backupFolder}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div
          style={{
            width: 220,
            height: 4,
            borderRadius: 99,
            background: 'rgba(31,77,58,0.14)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--green-800)',
              transition: 'width 300ms ease',
            }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--green-900)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {progress.done}/{progress.total}
        </span>
      </div>
    </div>
  );
}
