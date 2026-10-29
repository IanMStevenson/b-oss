// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { AlertTriangle } from 'lucide-react';
import type { DescribedReason, ReasonAction } from './ragReasons.js';
import { openStatusPage } from './statusLink.js';

interface Props {
  reasons: DescribedReason[];
  onAction: (action: ReasonAction) => void;
}

const ACTION_LABEL: Record<ReasonAction, string> = {
  sign_in: 'Sign in',
  retry: 'Retry',
  dismiss: 'Dismiss',
  backup_now: 'Retry',
  status: 'Check Blipfoto Status',
};

/**
 * Calm counterpart of AuthErrorBanner: amber means the backup may be incomplete and will
 * probably recover, so each reason is listed with whatever the user can do about it.
 */
export function AmberBanner({ reasons, onAction }: Props) {
  if (reasons.length === 0) return null;
  return (
    <div
      role="status"
      style={{
        background: 'rgba(232, 169, 60, 0.10)',
        padding: '10px 24px',
        borderBottom: '1px solid rgba(232, 169, 60, 0.35)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <AlertTriangle
        size={17}
        strokeWidth={1.7}
        color="var(--rag-amber)"
        style={{ flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {reasons.map((r) => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink-2)' }}>
              {r.text}
            </div>
            {r.actions.map((a) => (
              <button
                key={a}
                onClick={() => (a === 'status' ? openStatusPage() : onAction(a))}
                style={{
                  flexShrink: 0,
                  height: 26,
                  padding: '0 11px',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid rgba(232, 169, 60, 0.7)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
