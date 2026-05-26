// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef } from 'react';
import { FileText, X, Pause, Play, Download } from 'lucide-react';
import type { LogEntry } from '../../backend.js';
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

export function LogPanel() {
  const { state, dispatch, backend } = useApp();
  const accounts = state.store?.accounts ?? [];
  const [journalFilter, setJournalFilter] = useState<string>('all'); // 'all' or account id
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('last');
  const [historicLogs, setHistoricLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedAtCountRef = useRef<number>(0);

  // Load historic logs on mount
  useEffect(() => {
    backend
      .getLogs()
      .then(setHistoricLogs)
      .catch(() => setHistoricLogs([]));
  }, [backend]);

  // Merge historic + every account's live buffer, deduplicate by id
  const allLogs = (() => {
    const seen = new Set<string>();
    const merged: LogEntry[] = [];
    const liveAcrossAccounts: LogEntry[] = [];
    for (const id of Object.keys(state.logBuffer)) {
      for (const e of state.logBuffer[id] ?? []) liveAcrossAccounts.push(e);
    }
    for (const entry of [...historicLogs, ...liveAcrossAccounts]) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }
    return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  })();

  const journalFiltered =
    journalFilter === 'all' ? allLogs : allLogs.filter((e) => e.account_id === journalFilter);

  // "Last backup" semantics:
  // - With a specific journal selected, show only the most recent backup_id
  //   for that journal.
  // - With "All" journals selected, show the most recent backup_id per account
  //   (so each journal contributes its latest run).
  const scopeFiltered = (() => {
    if (scopeFilter !== 'last') return journalFiltered;
    if (journalFilter === 'all') {
      // Most recent backup_id per account
      const mostRecentByAccount = new Map<string, string>();
      for (let i = allLogs.length - 1; i >= 0; i--) {
        const e = allLogs[i];
        if (!e?.backup_id) continue;
        if (!mostRecentByAccount.has(e.account_id)) {
          mostRecentByAccount.set(e.account_id, e.backup_id);
        }
      }
      if (mostRecentByAccount.size === 0) return [];
      return journalFiltered.filter(
        (e) => e.backup_id !== undefined && mostRecentByAccount.get(e.account_id) === e.backup_id,
      );
    }
    // Specific journal: most recent backup_id within that journal
    const lastBackupId = [...journalFiltered].reverse().find((e) => e.backup_id)?.backup_id ?? null;
    if (lastBackupId === null) return [];
    return journalFiltered.filter((e) => e.backup_id === lastBackupId);
  })();

  const filtered =
    levelFilter === 'all' ? scopeFiltered : scopeFiltered.filter((e) => e.level === levelFilter);

  // Auto-scroll to bottom on new entries, unless paused
  const bottomRef = useRef<HTMLDivElement>(null);
  const liveTotal = Object.values(state.logBuffer).reduce((a, b) => a + b.length, 0);
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveTotal, paused]);

  const newWhilePaused = paused ? liveTotal - pausedAtCountRef.current : 0;

  function togglePause() {
    if (paused) {
      setPaused(false);
    } else {
      pausedAtCountRef.current = liveTotal;
      setPaused(true);
    }
  }

  async function handleExport() {
    await backend.exportLogsCsv({
      account_id: journalFilter === 'all' ? null : journalFilter,
      backup_id: null,
      level: levelFilter,
    });
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

  const selectedJournalTitle =
    journalFilter === 'all'
      ? null
      : (accounts.find((a) => a.id === journalFilter)?.journal_title ?? null);

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
          {selectedJournalTitle ? `Log · ${selectedJournalTitle}` : 'Log'}
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
        {/* Journal filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Journal</span>
          <select
            value={journalFilter}
            onChange={(e) => setJournalFilter(e.target.value)}
            style={{
              height: 26,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--line)',
              fontSize: 12,
              background: 'white',
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            <option value="all">All</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.journal_title}
              </option>
            ))}
          </select>
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--line)', flexShrink: 0 }} />

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

        {/* Export CSV */}
        <button
          onClick={() => {
            void handleExport();
          }}
          aria-label="Export visible entries to CSV"
          title="Export visible entries to CSV"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 26,
            padding: '0 9px',
            borderRadius: 6,
            border: '1px solid var(--line)',
            background: 'transparent',
            color: 'var(--muted)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <Download size={11} strokeWidth={2} />
          Export CSV
        </button>

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
            {scopeFilter === 'last' && scopeFiltered.length === 0
              ? 'No backup sessions recorded yet.'
              : levelFilter === 'all'
                ? 'No log entries.'
                : `No ${LEVEL_LABEL[levelFilter === 'error' ? 'error' : levelFilter === 'warn' ? 'warn' : 'info'].toLowerCase()} entries.`}
          </div>
        )}
        {filtered.map((entry) => {
          const username = accounts.find((a) => a.id === entry.account_id)?.username ?? '';
          const showJournalCol = journalFilter === 'all' && username !== '';
          return (
            <div
              key={entry.id}
              style={{
                display: 'grid',
                gridTemplateColumns: showJournalCol ? '22px 92px 100px 1fr' : '22px 92px 1fr',
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
              {showJournalCol && (
                <span
                  style={{
                    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                    fontSize: 11.5,
                    color: 'var(--muted-2)',
                    lineHeight: 1.55,
                    paddingTop: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={username}
                >
                  {username}
                </span>
              )}
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
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
