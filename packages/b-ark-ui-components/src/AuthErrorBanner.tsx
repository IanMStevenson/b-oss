// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  errorMessage: string | null;
  highlighted: boolean;
  onReauthorise: () => void;
  /** Override the action button label. Defaults to "Reauthorise". */
  actionLabel?: string;
}

export const AuthErrorBanner = forwardRef<HTMLDivElement, Props>(function AuthErrorBanner(
  { errorMessage, highlighted, onReauthorise, actionLabel = 'Reauthorise' },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        background: 'rgba(208, 69, 69, 0.09)',
        padding: '11px 24px',
        borderBottom: '1px solid rgba(208, 69, 69, 0.28)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
        animation: highlighted ? 'error-flash 0.5s ease-in-out 3' : undefined,
      }}
    >
      <AlertTriangle size={17} strokeWidth={1.7} color="var(--rag-red)" style={{ flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--rag-red)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {errorMessage}
      </div>

      <button
        onClick={onReauthorise}
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
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
});
