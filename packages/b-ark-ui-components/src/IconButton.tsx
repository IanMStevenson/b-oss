// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Square icon-only action button used in the account header bar. The caller supplies the
// icon as children (so each shell controls icon size/stroke); this owns the button chrome
// and the green hover affordance.

import type { ReactNode } from 'react';

export interface IconButtonProps {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}

export function IconButton({ label, onClick, children }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--muted)',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--green-100)';
        e.currentTarget.style.color = 'var(--green-800)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--muted)';
      }}
    >
      {children}
    </button>
  );
}
