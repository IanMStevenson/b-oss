// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef } from 'react';
import { FileText, X, Pause, Play } from 'lucide-react';
import type { AccountConfig, LogEntry } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';

type LevelFilter = 'all' | 'error' | 'warn' | 'info';
type ScopeFilter = 'last' | 'all';

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
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('last');
  const [historicLogs, setHistoricLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedAtCountRef = useRef<number>(0);

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

  // Find the most recent backup_id (from the last entry that has one)
  const lastBackupId = [...allLogs].reverse().find((e) => e.backup_id)?.backup_id ?? null;

  const scopeFiltered =
    scopeFilter === 'last' && lastBackupId !== null
      ? allLogs.filter((e) => e.backup_id === lastBackupId)
      : allLogs;

  const filtered =
    levelFilter === 'all' ? scopeFiltered : scopeFiltered.filter((e) => e.level === levelFilter);

  // Auto-scroll to bottom on new entries, unless paused
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveBuffer.length, paused]);

  const newWhilePaused = paused ? liveBuffer.length - pausedAtCountRef.current : 0;

  function togglePause() {
    if (paused) {
      setPaused(false);
    } else {
      pausedAtCountRef.current = liveBuffer.length;
      setPaused(true);
    }
  }

  const scopeOptions: { key: ScopeFilter; label: string }[] = [
    { key: 'last', label: 'Last backup' },
    { key: 'all', label: 'All' },
  ];

  const levelOptions: { key: LevelFilter; label: string }[] = [
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
          gap: 14,
          flexShrink: 0,
          fontSize: 12,
          color: 'var(--muted)',
          flexWrap: 'wrap',
        }}
      >
        {/* Scope filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Scope</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {scopeOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setScopeFilter(key)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: scopeFilter === key ? 'var(--green-100)' : 'transparent',
                  color: scopeFilter === key ? 'var(--green-800)' : 'var(--muted)',
                  fontSize: 12,
                  fontWeight: scopeFilter === key ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--line)', flexShrink: 0 }} />

        {/* Level filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Level</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {levelOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setLevelFilter(key)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: levelFilter === key ? 'var(--green-100)' : 'transparent',
                  color: levelFilter === key ? 'var(--green-800)' : 'var(--muted)',
                  fontSize: 12,
                  fontWeight: levelFilter === key ? 600 : 400,
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
        </div>

        <div style={{ flex: 1 }} />

        {/* Pause / resume scroll */}
        <button
          onClick={togglePause}
          aria-label={paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
          title={paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 26,
            padding: '0 9px',
            borderRadius: 6,
            border: paused ? '1px solid var(--rag-amber)' : '1px solid var(--line)',
            background: paused ? 'var(--rag-amber-bg, #fffaf0)' : 'transparent',
            color: paused ? 'var(--rag-amber)' : 'var(--muted)',
            fontSize: 12,
            fontWeight: paused ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          {paused ? <Play size={11} strokeWidth={2} /> : <Pause size={11} strokeWidth={2} />}
          {paused ? (newWhilePaused > 0 ? `+${newWhilePaused} new` : 'Paused') : 'Live'}
        </button>

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
            {scopeFilter === 'last' && lastBackupId === null
              ? 'No backup sessions recorded yet.'
              : levelFilter === 'all'
                ? 'No log entries.'
                : `No ${LEVEL_LABEL[levelFilter === 'error' ? 'error' : levelFilter === 'warn' ? 'warn' : 'info'].toLowerCase()} entries.`}
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
