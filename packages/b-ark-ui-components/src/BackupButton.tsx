// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The header's primary "Back up now" button. Renders the CloudDownload icon by default so
// both shells (desktop + extension) get the same iconed button. The `cancel` variant is the
// red in-progress toggle; `busy` dims/disables the primary button while a run is underway.

import { CloudDownload } from 'lucide-react';
import type { ReactNode } from 'react';

export interface BackupButtonProps {
  label: string;
  onClick?: () => void;
  /** Dims + disables the primary button and hides its icon (e.g. "Backing up…"). */
  busy?: boolean;
  /** 'primary' = green start button; 'cancel' = red in-progress cancel button. */
  variant?: 'primary' | 'cancel';
  /** Override the default CloudDownload icon; pass null to omit it entirely. */
  icon?: ReactNode;
}

export function BackupButton({
  label,
  onClick,
  busy = false,
  variant = 'primary',
  icon,
}: BackupButtonProps) {
  const isCancel = variant === 'cancel';
  const resolvedIcon = icon === undefined ? <CloudDownload size={14} strokeWidth={1.6} /> : icon;
  const showIcon = !isCancel && !busy && resolvedIcon;

  return (
    <button
      disabled={busy}
      onClick={onClick}
      style={{
        height: 32,
        padding: '0 14px',
        borderRadius: 7,
        background: isCancel ? 'rgba(208,69,69,0.1)' : 'var(--green-800)',
        color: isCancel ? 'var(--rag-red)' : 'white',
        fontSize: 13,
        fontWeight: 600,
        border: isCancel ? '1px solid rgba(208,69,69,0.2)' : 'none',
        cursor: busy ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        opacity: busy ? 0.7 : 1,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {showIcon}
      {label}
    </button>
  );
}
