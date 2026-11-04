// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { AlertTriangle } from 'lucide-react';
import type { StartupTaskWarning } from './startupTask.js';

interface Props {
  warning: StartupTaskWarning;
  busy?: boolean;
  onAction: (action: StartupTaskWarning['action']) => void;
}

/**
 * Red, always-visible banner: if b-ark does not start at sign-in, scheduled backups silently do
 * not run, so this is as loud as the auth-error banner and carries a single action.
 */
export function StartupTaskBanner({ warning, busy = false, onAction }: Props) {
  return (
    <div
      role="alert"
      style={{
        background: 'rgba(208, 69, 69, 0.09)',
        padding: '11px 24px',
        borderBottom: '1px solid rgba(208, 69, 69, 0.28)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <AlertTriangle
        size={17}
        strokeWidth={1.7}
        color="var(--rag-red)"
        style={{ flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
        <div style={{ fontWeight: 600, color: 'var(--rag-red)' }}>{warning.headline}</div>
        <div style={{ color: 'var(--ink-2)', marginTop: 2 }}>{warning.text}</div>
      </div>
      <button
        disabled={busy}
        onClick={() => onAction(warning.action)}
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
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {warning.actionLabel}
      </button>
    </div>
  );
}
