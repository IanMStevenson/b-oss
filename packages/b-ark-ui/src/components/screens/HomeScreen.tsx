// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Viewer approach: HomeScreen calls backend.getViewerUrl(accountId) to get a base URL
// served by the Electron local HTTP server. journal.json is fetched from that URL.
// This keeps all port/path details in the main process and out of the UI.

import { useState, useEffect, useRef } from 'react';
import {
  ZoomOut,
  ZoomIn,
  RotateCcw,
  LayoutGrid,
  FileText,
  Settings,
  CloudDownload,
  Home,
} from 'lucide-react';
import { ThumbnailGrid, EntryDetail, DatePicker, useJournal, useEntry } from '@b-oss/b-view';
import type { EntryIndex } from '@b-oss/b-view';
import type { AccountConfig } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';
import { BackupBanner } from '../BackupBanner.js';
import { StatusBar } from '../StatusBar.js';
import { Avatar } from '../Avatar.js';

interface HomeScreenProps {
  account: AccountConfig;
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-2)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--green-100)';
        e.currentTarget.style.color = 'var(--green-800)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--ink-2)';
      }}
    >
      {children}
    </button>
  );
}

export function HomeScreen({ account }: HomeScreenProps) {
  const { state, dispatch, backend } = useApp();
  const { thumbnailSizePercent, backupProgress, selectedEntryId } = state;

  const progress = backupProgress[account.id];
  const isBackingUp = progress?.running === true;
  const isRateLimited = progress?.rate_limited_seconds != null;

  // Countdown for rate-limit display
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (isRateLimited && progress.rate_limited_seconds != null) {
      setCountdown(progress.rate_limited_seconds);
    } else {
      setCountdown(null);
    }
  }, [isRateLimited, progress?.rate_limited_seconds]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => (c != null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Calendar picker state
  const [topLeftEntryDate, setTopLeftEntryDate] = useState<string | null>(null);
  const [jumpToEntryId, setJumpToEntryId] = useState<string | null>(null);

  // Load viewer URL from backend
  const [gridResetKey, setGridResetKey] = useState(0);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  useEffect(() => {
    backend
      .getViewerUrl(account.id)
      .then(setViewerUrl)
      .catch(() => setViewerUrl(null));
  }, [backend, account.id]);

  // Force the journal viewer to refetch the moment a backup ends, since the
  // 5s polling setInterval below may never have fired during a short backup.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const prevBackingUpRef = useRef(isBackingUp);
  useEffect(() => {
    if (prevBackingUpRef.current && !isBackingUp) {
      setRefreshNonce((n) => n + 1);
    }
    prevBackingUpRef.current = isBackingUp;
  }, [isBackingUp]);

  const journalState = useJournal(
    viewerUrl ? `${viewerUrl}/journal.json` : undefined,
    isBackingUp ? 5000 : undefined,
    refreshNonce,
  );
  const entries: EntryIndex[] = journalState.status === 'loaded' ? journalState.data.entries : [];

  const selectedIdx = entries.findIndex((e) => e.entry_id === selectedEntryId);
  // entries is newest-first; [idx+1] is older (back in time), [idx-1] is newer (forward)
  const prevEntryId =
    selectedIdx >= 0 && selectedIdx < entries.length - 1
      ? (entries[selectedIdx + 1]?.entry_id ?? null)
      : null;
  const nextEntryId = selectedIdx > 0 ? (entries[selectedIdx - 1]?.entry_id ?? null) : null;

  const entryJsonPath =
    selectedEntryId && viewerUrl
      ? (() => {
          const entry = entries.find((e) => e.entry_id === selectedEntryId);
          return entry ? `${viewerUrl}/${entry.json_path}` : null;
        })()
      : null;

  const entryState = useEntry(entryJsonPath);

  function backupButtonLabel(): string {
    if (isRateLimited && countdown != null) return `⏸ Rate limited — resuming in ${countdown}s`;
    if (isBackingUp) return 'Backing up…';
    return 'Backup now';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          padding: '18px 24px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        <Avatar
          accountId={account.id}
          name={account.journal_title}
          remoteUrl={account.avatar_url}
          refreshKey={account.last_backup_at}
          size={40}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}
          >
            {account.journal_title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            @{account.username}
            {journalState.status === 'loaded' && (
              <>
                {' · since '}
                {journalState.data.entries.length > 0
                  ? new Date(
                      journalState.data.entries[journalState.data.entries.length - 1]?.date ?? '',
                    ).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
                {' · '}
                {journalState.data.entry_total.toLocaleString()} entries
              </>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <IconBtn label="First page" onClick={() => setGridResetKey((k) => k + 1)}>
            <Home size={15} strokeWidth={1.6} />
          </IconBtn>

          {entries.length > 0 && (
            <DatePicker
              entries={entries}
              currentDate={
                selectedEntryId !== null
                  ? (entries.find((e) => e.entry_id === selectedEntryId)?.date ?? null)
                  : topLeftEntryDate
              }
              onNavigate={(entryId) => {
                if (selectedEntryId !== null) {
                  dispatch({ type: 'entry:select', entryId });
                } else {
                  setJumpToEntryId(entryId);
                }
              }}
            />
          )}

          {/* Thumbnail size group */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'white',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}
          >
            <IconBtn
              label="Zoom out"
              onClick={() =>
                dispatch({ type: 'thumbnail:resize', percent: thumbnailSizePercent - 10 })
              }
            >
              <ZoomOut size={14} strokeWidth={1.6} />
            </IconBtn>
            <span
              style={{
                fontSize: 12,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--muted)',
                minWidth: 36,
                textAlign: 'center',
              }}
            >
              {thumbnailSizePercent}%
            </span>
            <IconBtn
              label="Zoom in"
              onClick={() =>
                dispatch({ type: 'thumbnail:resize', percent: thumbnailSizePercent + 10 })
              }
            >
              <ZoomIn size={14} strokeWidth={1.6} />
            </IconBtn>
            <IconBtn
              label="Reset zoom"
              onClick={() => dispatch({ type: 'thumbnail:resize', percent: 100 })}
            >
              <RotateCcw size={14} strokeWidth={1.6} />
            </IconBtn>
          </div>

          <IconBtn label="Open in browser" onClick={() => void backend.openViewer(account.id)}>
            <LayoutGrid size={15} strokeWidth={1.6} />
          </IconBtn>

          <IconBtn label="View log" onClick={() => dispatch({ type: 'panel:open', panel: 'log' })}>
            <FileText size={15} strokeWidth={1.6} />
          </IconBtn>

          <IconBtn
            label="Settings"
            onClick={() => dispatch({ type: 'panel:open', panel: 'settings' })}
          >
            <Settings size={15} strokeWidth={1.6} />
          </IconBtn>

          <button
            disabled={isBackingUp}
            onClick={() => {
              void backend.startBackup(account.id);
            }}
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 7,
              background: 'var(--green-800)',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: isBackingUp ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: isBackingUp ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {!isBackingUp && <CloudDownload size={14} strokeWidth={1.6} />}
            {backupButtonLabel()}
          </button>
        </div>
      </div>

      {/* Backup banner */}
      {isBackingUp && progress && (
        <BackupBanner
          journalTitle={account.journal_title}
          backupFolder={account.backup_folder}
          progress={progress}
          countdownSeconds={countdown}
        />
      )}

      {/* Main area */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {selectedEntryId !== null ? (
          <EntryDetail
            entryState={entryState}
            prevEntryId={prevEntryId}
            nextEntryId={nextEntryId}
            onNavigate={(id) => dispatch({ type: 'entry:select', entryId: id })}
            onClose={() => dispatch({ type: 'entry:select', entryId: null })}
            baseUrl={viewerUrl ?? undefined}
            entries={entries}
          />
        ) : journalState.status === 'error' && isBackingUp ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-2)',
              fontSize: 14,
            }}
          >
            Backup in progress — entries will appear shortly
          </div>
        ) : (
          <ThumbnailGrid
            key={gridResetKey}
            entries={entries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={(id) => dispatch({ type: 'entry:select', entryId: id })}
            sizePercent={thumbnailSizePercent}
            baseUrl={viewerUrl ?? undefined}
            jumpToEntryId={jumpToEntryId}
            onTopLeftEntryDate={setTopLeftEntryDate}
          />
        )}
      </div>

      <StatusBar account={account} />
    </div>
  );
}
