// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { RefreshCw, PauseCircle } from 'lucide-react';
import type { BackupPhase } from './backend.js';
import type { BackupProgress } from './view-types.js';

interface BackupBannerProps {
  journalTitle: string;
  backupFolder: string;
  progress: BackupProgress;
  countdownSeconds: number | null;
}

const PHASE_ORDER: BackupPhase[] = ['redo', 'gap_fill', 'new_posts', 'image_repair'];
const PHASE_LABELS: Record<BackupPhase, string> = {
  redo: 'REDO',
  gap_fill: 'GAPS',
  new_posts: 'NEW',
  image_repair: 'FIX',
};

function phaseSubText(phase: BackupPhase | null, done: number, total: number): string {
  if (phase === null) return '';
  if (phase === 'redo') return `Re-checking recent · ${done} of ${total}`;
  if (phase === 'gap_fill') {
    return total === 0 ? 'Filling gaps · checking…' : `Filling gaps · ${done} of ${total}`;
  }
  if (phase === 'new_posts') {
    return total === 0
      ? 'Fetching new entries · none'
      : `Fetching new entries · ${done} of ${total}`;
  }
  return total === 0 ? 'Repairing images · none' : `Repairing images · ${done} of ${total}`;
}

function cellFill(
  cellPhase: BackupPhase,
  activePhase: BackupPhase | null,
  done: number,
  total: number,
): number {
  if (activePhase === null) return 0;
  const cellIdx = PHASE_ORDER.indexOf(cellPhase);
  const activeIdx = PHASE_ORDER.indexOf(activePhase);
  if (cellIdx < activeIdx) return 100;
  if (cellIdx > activeIdx) return 0;
  if (total === 0) return 100;
  return Math.min(100, Math.round((done / total) * 100));
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

  if (progress.kind === 'routine') {
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
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--muted)',
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {phaseSubText(progress.phase, progress.done, progress.total)}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            flexShrink: 0,
            width: 240,
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {PHASE_ORDER.map((p) => {
              const fill = cellFill(p, progress.phase, progress.done, progress.total);
              return (
                <div
                  key={p}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 99,
                    background: 'rgba(31,77,58,0.14)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${fill}%`,
                      height: '100%',
                      background: 'var(--green-800)',
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PHASE_ORDER.map((p) => (
              <div
                key={p}
                style={{
                  flex: 1,
                  fontSize: 10,
                  fontWeight: 600,
                  textAlign: 'center',
                  letterSpacing: 0.5,
                  color: p === progress.phase ? 'var(--green-900)' : 'var(--muted)',
                }}
              >
                {PHASE_LABELS[p]}
              </div>
            ))}
          </div>
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
