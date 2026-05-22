// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Viewer approach: HomeScreen calls backend.getViewerUrl(accountId) to get a base URL
// served by the Electron local HTTP server. journal.json is fetched from that URL.
// This keeps all port/path details in the main process and out of the UI.

import { useState, useEffect } from 'react';
import {
  ZoomOut,
  ZoomIn,
  RotateCcw,
  LayoutGrid,
  FileText,
  Settings,
  CloudDownload,
} from 'lucide-react';
import { ThumbnailGrid, EntryDetail, useJournal, useEntry } from '@b-oss/b-view';
import type { EntryIndex } from '@b-oss/b-view';
import type { AccountConfig } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';
import { BackupBanner } from '../BackupBanner.js';
import { StatusBar } from '../StatusBar.js';

interface HomeScreenProps {
  account: AccountConfig;
}

function AvatarWithFallback({ url, name, size }: { url: string; name: string; size: number }) {
  const [error, setError] = useState(false);
  const initial = (name[0] ?? '?').toUpperCase();
  const colours = ['#1f4d3a', '#2a6347', '#22a06b', '#2f6fd1'];
  const colour = colours[name.charCodeAt(0) % colours.length] ?? '#1f4d3a';

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: colour,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: size * 0.4,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      onError={() => setError(true)}
    />
  );
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
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--green-100)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--green-800)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-2)';
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

  // Load viewer URL from backend
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  useEffect(() => {
    backend
      .getViewerUrl(account.id)
      .then(setViewerUrl)
      .catch(() => setViewerUrl(null));
  }, [backend, account.id]);

  const journalState = useJournal(viewerUrl ? `${viewerUrl}/journal.json` : undefined);
  const entries: EntryIndex[] = journalState.status === 'loaded' ? journalState.data.entries : [];

  const selectedIdx = entries.findIndex((e) => e.entry_id === selectedEntryId);
  const prevEntryId = selectedIdx > 0 ? (entries[selectedIdx - 1]?.entry_id ?? null) : null;
  const nextEntryId =
    selectedIdx < entries.length - 1 ? (entries[selectedIdx + 1]?.entry_id ?? null) : null;

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
        <AvatarWithFallback url={account.avatar_url} name={account.journal_title} size={40} />

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

          <IconBtn label="Grid layout">
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
          />
        ) : (
          <ThumbnailGrid
            entries={entries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={(id) => dispatch({ type: 'entry:select', entryId: id })}
            sizePercent={thumbnailSizePercent}
          />
        )}
      </div>

      <StatusBar account={account} />
    </div>
  );
}
