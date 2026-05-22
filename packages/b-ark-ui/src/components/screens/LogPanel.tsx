// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef } from 'react';
import { FileText, X } from 'lucide-react';
import type { AccountConfig, LogEntry } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';

type Filter = 'all' | 'error' | 'warn' | 'info';

const LEVEL_COLOUR: Record<LogEntry['level'], string> = {
  error: 'var(--rag-red)',
  warn: 'var(--rag-amber)',
  info: 'var(--blue-info)',
};

const LEVEL_LABEL: Record<LogEntry['level'], string> = {
  error: 'Errors',
  warn: 'Warnings',
  info: 'Info',
};

const ROW_BG: Record<LogEntry['level'], string> = {
  error: '#fdf6f5',
  warn: '#fffaf0',
  info: '#ffffff',
};

function LevelBadge({ level }: { level: LogEntry['level'] }) {
  const colour = LEVEL_COLOUR[level];
  const glyph = level === 'error' ? '×' : level === 'warn' ? '!' : 'i';

  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: colour,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: level === 'warn' ? 10 : 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {glyph}
    </div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface LogPanelProps {
  account: AccountConfig;
}

export function LogPanel({ account }: LogPanelProps) {
  const { state, dispatch, backend } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [historicLogs, setHistoricLogs] = useState<LogEntry[]>([]);

  // Load historic logs on mount
  useEffect(() => {
    backend
      .getLogs(account.id)
      .then(setHistoricLogs)
      .catch(() => setHistoricLogs([]));
  }, [backend, account.id]);

  // Merge historic + live buffer, deduplicate by id
  const liveBuffer = state.logBuffer[account.id] ?? [];
  const allLogs = (() => {
    const seen = new Set<string>();
    const merged: LogEntry[] = [];
    for (const entry of [...historicLogs, ...liveBuffer]) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }
    return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  })();

  const filtered =
    filter === 'all'
      ? allLogs
      : allLogs.filter(
          (e) => e.level === (filter === 'warn' ? 'warn' : filter === 'error' ? 'error' : 'info'),
        );

  // Auto-scroll to bottom on new entries
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveBuffer.length]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'error', label: 'Errors' },
    { key: 'warn', label: 'Warnings' },
    { key: 'info', label: 'Info' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        animation: 'panelIn 220ms cubic-bezier(0.22,0.61,0.36,1)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <FileText size={16} strokeWidth={1.6} color="var(--green-800)" />
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>
          Log &middot; {account.journal_title}
        </span>
        <button
          onClick={() => dispatch({ type: 'panel:close' })}
          aria-label="Close log"
          style={{ color: 'var(--muted)', display: 'flex', borderRadius: 4, padding: 2 }}
        >
          <X size={16} strokeWidth={1.6} />
        </button>
      </div>

      {/* Filter toolbar */}
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        <span>Filter</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {filters.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 6,
                border: 'none',
                background: filter === key ? 'var(--green-100)' : 'transparent',
                color: filter === key ? 'var(--green-800)' : 'var(--muted)',
                fontSize: 12,
                fontWeight: filter === key ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {key !== 'all' && (
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background:
                      key === 'error'
                        ? 'var(--rag-red)'
                        : key === 'warn'
                          ? 'var(--rag-amber)'
                          : 'var(--blue-info)',
                  }}
                />
              )}
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {filtered.length} of {allLogs.length}
        </span>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 12px' }}>
        {filtered.length === 0 && (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 13,
            }}
          >
            {filter === 'all'
              ? `No log entries for ${LEVEL_LABEL['info'].toLowerCase()}.`
              : `No ${LEVEL_LABEL[filter === 'error' ? 'error' : filter === 'warn' ? 'warn' : 'info'].toLowerCase()} entries.`}
          </div>
        )}
        {filtered.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '22px 92px 1fr',
              gap: 10,
              padding: '6px 20px',
              borderBottom: '1px solid var(--line-2)',
              background: ROW_BG[entry.level],
              alignItems: 'start',
            }}
          >
            <div style={{ paddingTop: 1 }}>
              <LevelBadge level={entry.level} />
            </div>
            <span
              style={{
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                fontSize: 11.5,
                color: 'var(--muted)',
                lineHeight: 1.55,
                paddingTop: 1,
              }}
            >
              {fmtTime(entry.timestamp)}
            </span>
            <span
              style={{
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                fontSize: 11.5,
                color: 'var(--ink)',
                lineHeight: 1.55,
              }}
            >
              {entry.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
