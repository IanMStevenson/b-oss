// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Viewer approach: HomeScreen calls backend.getViewerUrl(accountId) to get a base URL
// served by the Electron local HTTP server. journal.json is fetched from that URL.
// This keeps all port/path details in the main process and out of the UI.

import { useState, useEffect, useRef, useCallback, useDeferredValue } from 'react';
import { ExternalLink, FileText, Settings } from 'lucide-react';
import { ThumbnailGrid, EntryDetail } from '@b-oss/b-view';
import type { BlipEntry, EntryIndex } from '@b-oss/b-view';
import { useJournal, useEntry, useSearchEntries } from '@b-oss/b-view-backup';
import type { AccountConfig } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';
import {
  BackupBanner,
  AccountHeaderBar,
  IconButton,
  BackupButton,
} from '@b-oss/b-ark-ui-components';
import { AuthErrorBanner } from '../AuthErrorBanner.js';
import { StatusBar } from '../StatusBar.js';
import { Avatar } from '../Avatar.js';

interface HomeScreenProps {
  account: AccountConfig;
  compact?: boolean;
}

export function HomeScreen({ account, compact }: HomeScreenProps) {
  const { state, dispatch, backend } = useApp();
  const { thumbnailSizePercent, showInfoOverlay, backupProgress, selectedEntryId } = state;

  const progress = backupProgress[account.id];
  const isBackingUp = progress?.running === true;
  const isRateLimited = progress?.rate_limited_seconds != null;

  const [bannerHighlighted, setBannerHighlighted] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

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

  const entryCacheRef = useRef<Map<string, BlipEntry>>(new Map());
  const viewerUrlRef = useRef(viewerUrl);
  viewerUrlRef.current = viewerUrl;
  useEffect(() => {
    entryCacheRef.current.clear();
  }, [viewerUrl]);

  const resolveEntry = useCallback(async (jsonPath: string): Promise<BlipEntry> => {
    const base = viewerUrlRef.current;
    if (!base) throw new Error('No viewer URL');
    const url = `${base}/${jsonPath}`;
    const cached = entryCacheRef.current.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as BlipEntry;
    entryCacheRef.current.set(url, data);
    return data;
  }, []);

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

  // In-grid search is owned by this screen since ThumbnailGrid moved to @b-oss/b-view and no
  // longer imports a backup-data hook itself (see PLAN.md's Phase 0.2).
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchState = useSearchEntries(deferredSearchQuery, entries, resolveEntry);

  function backupButtonLabel(): string {
    if (isRateLimited && countdown != null) return `⏸ Rate limited — resuming in ${countdown}s`;
    if (isBackingUp) return 'Backing up…';
    return 'Backup now';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <AccountHeaderBar
        avatar={
          <Avatar
            accountId={account.id}
            name={account.journal_title}
            remoteUrl={account.avatar_url}
            refreshKey={account.last_backup_at}
            size={40}
          />
        }
        avatarSize={40}
        title={account.journal_title}
        titleFontSize={18}
        username={account.username}
        metaReady={journalState.status === 'loaded'}
        sinceDate={
          journalState.status === 'loaded' && journalState.data.entries.length > 0
            ? (journalState.data.entries[journalState.data.entries.length - 1]?.date ?? null)
            : null
        }
        entryTotal={journalState.status === 'loaded' ? journalState.data.entry_total : 0}
        padding="18px 24px 14px"
        gap={14}
        actions={
          <>
            <IconButton label="Open in browser" onClick={() => void backend.openViewer(account.id)}>
              <ExternalLink size={15} strokeWidth={1.6} />
            </IconButton>
            <IconButton
              label="View log"
              onClick={() => dispatch({ type: 'panel:open', panel: 'log' })}
            >
              <FileText size={15} strokeWidth={1.6} />
            </IconButton>
            <IconButton
              label="Settings"
              onClick={() => dispatch({ type: 'panel:open', panel: 'settings' })}
            >
              <Settings size={15} strokeWidth={1.6} />
            </IconButton>
            <BackupButton
              label={backupButtonLabel()}
              busy={isBackingUp}
              onClick={() => {
                if (account.rag_state === 'red' && account.error_message) {
                  setBannerHighlighted(true);
                  bannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  setTimeout(() => setBannerHighlighted(false), 1500);
                  return;
                }
                void backend.startBackup(account.id);
              }}
            />
          </>
        }
      />

      {/* Auth error banner */}
      {account.rag_state === 'red' && account.error_message && (
        <AuthErrorBanner ref={bannerRef} account={account} highlighted={bannerHighlighted} />
      )}

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
        {selectedEntryId !== null && (
          <EntryDetail
            entryState={entryState}
            prevEntryId={prevEntryId}
            nextEntryId={nextEntryId}
            onNavigate={(id) => dispatch({ type: 'entry:select', entryId: id })}
            onClose={() => dispatch({ type: 'entry:select', entryId: null })}
            baseUrl={viewerUrl ?? undefined}
            entries={entries}
          />
        )}
        {journalState.status === 'error' && isBackingUp && selectedEntryId === null && (
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
        )}
        {/* Keep ThumbnailGrid mounted once journal is loaded so grid position and
            search state survive the round-trip into EntryDetail and back. */}
        {journalState.status === 'loaded' && (
          <div
            style={{
              display: selectedEntryId === null ? 'flex' : 'none',
              flex: 1,
              overflow: 'hidden',
              flexDirection: 'column',
            }}
          >
            <ThumbnailGrid
              entries={entries}
              selectedEntryId={selectedEntryId}
              onSelectEntry={(id) => dispatch({ type: 'entry:select', entryId: id })}
              sizePercent={thumbnailSizePercent}
              onSizeChange={(pct) => dispatch({ type: 'thumbnail:resize', percent: pct })}
              showInfoOverlay={showInfoOverlay}
              onShowInfoOverlayChange={(v) => {
                dispatch({ type: 'ui:set-overlay', showOverlay: v });
                void backend.updateSettings({ showInfoOverlay: v });
              }}
              baseUrl={viewerUrl ?? undefined}
              search={
                viewerUrl
                  ? {
                      query: searchQuery,
                      onQueryChange: setSearchQuery,
                      results: searchState.results,
                      status: searchState.status,
                      progress: searchState.progress,
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>

      <StatusBar account={account} compact={compact} />
    </div>
  );
}
