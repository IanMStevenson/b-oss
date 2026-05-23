// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { InfoBadge } from './InfoBadge.js';

export function TopBar() {
  return (
    <div
      style={{
        height: 52,
        background: 'var(--green-800)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '-0.01em',
          }}
        >
          b-ark
        </span>
      </div>

      <InfoBadge />
    </div>
  );
}
