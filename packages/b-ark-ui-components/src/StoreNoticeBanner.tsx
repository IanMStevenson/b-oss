// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Store } from 'lucide-react';
import { STORE_HOW_IT_WORKS_URL, STORE_NOTICE_TEXT, STORE_URL } from './storeNotice.js';

interface Props {
  onDismiss: () => void;
  onSnooze: () => void;
}

const secondary = {
  flexShrink: 0,
  height: 26,
  padding: '0 11px',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--ink-2)',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--border, rgba(0, 0, 0, 0.25))',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
} as const;

/**
 * Launch notice for GitHub-installer users: b-ark is on the Microsoft Store. Links open through a
 * plain new-window request, which b-ark's window-open handler hands to the OS browser.
 * Tab order: Get from the Store, How it works, Dismiss (until next launch), Remind me later (14 days).
 */
export function StoreNoticeBanner({ onDismiss, onSnooze }: Props) {
  function open(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return (
    <div
      role="region"
      aria-label="b-ark is now on the Microsoft Store"
      style={{
        background: 'rgba(60, 130, 232, 0.08)',
        padding: '10px 24px',
        borderBottom: '1px solid rgba(60, 130, 232, 0.35)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <Store
        size={17}
        strokeWidth={1.7}
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{STORE_NOTICE_TEXT}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => open(STORE_URL)}
            style={{
              ...secondary,
              background: 'var(--accent, #2563eb)',
              color: '#fff',
              border: '1px solid transparent',
            }}
          >
            Get b-ark from the Store
          </button>
          <a
            href={STORE_HOW_IT_WORKS_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={secondary}
          >
            How it works
          </a>
          <button type="button" onClick={onDismiss} style={secondary}>
            Dismiss
          </button>
          <button type="button" onClick={onSnooze} style={secondary}>
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}
