// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { RefreshCw, PauseCircle } from 'lucide-react';
import type { BackupProgress } from '../context/reducer.js';

interface BackupBannerProps {
  journalTitle: string;
  backupFolder: string;
  progress: BackupProgress;
  countdownSeconds: number | null;
}

export function BackupBanner({
  journalTitle,
  backupFolder,
  progress,
  countdownSeconds,
}: BackupBannerProps) {
  const isRateLimited = progress.rate_limited_seconds != null;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  if (isRateLimited) {
    return (
      <div
        style={{
          background: 'rgba(232,169,60,0.14)',
          padding: '12px 24px',
          borderBottom: '1px solid rgba(232,169,60,0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
        }}
      >
        <PauseCircle
          size={18}
          strokeWidth={1.6}
          color="var(--rag-amber)"
          style={{ flexShrink: 0 }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            Blipfoto rate limit reached on &ldquo;{journalTitle}&rdquo;
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--muted)',
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {countdownSeconds != null && countdownSeconds > 0
              ? `Resuming in ${countdownSeconds}s`
              : 'Resuming shortly…'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div
            style={{
              width: 220,
              height: 4,
              borderRadius: 99,
              background: 'rgba(232,169,60,0.18)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: 'var(--rag-amber)',
                transition: 'width 300ms ease',
              }}
            />
          </div>
          {progress.total > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
      </div>
    );
  }

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
            position: 'relative',
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
