// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Archive, Calendar, Clock, AlertCircle, FileText } from 'lucide-react';
import type { AccountConfig } from '../backend.js';
import { useApp } from '../context/AppContext.js';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtScheduled(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

interface StatusBarProps {
  account: AccountConfig;
}

export function StatusBar({ account }: StatusBarProps) {
  const { dispatch } = useApp();

  const ragColour =
    account.rag_state === 'green'
      ? 'var(--rag-green)'
      : account.rag_state === 'amber'
        ? 'var(--rag-amber)'
        : 'var(--rag-red)';

  const ragLabel =
    account.rag_state === 'green'
      ? 'Up to date'
      : account.rag_state === 'amber'
        ? account.error_message
          ? 'Warning'
          : 'Catching up'
        : 'Needs attention';

  const sep = <div style={{ width: 1, height: 14, background: 'var(--line)', margin: '0 4px' }} />;

  return (
    <div
      style={{
        height: 38,
        background: 'var(--bg-alt)',
        borderTop: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 14,
        fontSize: 11.5,
        color: 'var(--muted)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* RAG */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{ width: 8, height: 8, borderRadius: '50%', background: ragColour, flexShrink: 0 }}
        />
        <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{ragLabel}</span>
      </div>

      {sep}

      {/* Archived count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Archive size={12} strokeWidth={1.6} />
        <span>
          <strong>{account.total_archived.toLocaleString()}</strong>
          {' of '}
          <strong>{account.journal_entry_total.toLocaleString()}</strong>
          {' archived'}
        </span>
      </div>

      {sep}

      {/* Last entry */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Calendar size={12} strokeWidth={1.6} />
        <span>
          Last entry: <strong>{fmtDate(account.last_backup_at)}</strong>
        </span>
      </div>

      {sep}

      {/* Last backup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Clock size={12} strokeWidth={1.6} />
        <span>
          Last backup: <strong>{relativeTime(account.last_backup_at)}</strong>
          {' · next '}
          {fmtScheduled(account.schedule.next_run)}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Error */}
      {account.error_message && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--rag-red)' }}>
            <AlertCircle size={12} strokeWidth={1.6} />
            <span>{account.error_message}</span>
          </div>
          {sep}
        </>
      )}

      {/* View log */}
      <button
        onClick={() => dispatch({ type: 'panel:open', panel: 'log' })}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          color: 'var(--green-700)',
          fontSize: 11.5,
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          padding: 0,
        }}
      >
        <FileText size={12} strokeWidth={1.6} />
        View log
      </button>
    </div>
  );
}
