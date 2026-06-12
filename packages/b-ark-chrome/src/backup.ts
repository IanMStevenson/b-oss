// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BlipfotoClient } from '@b-oss/b-api';
import {
  BackupEngine,
  LogManager,
  type AccountBackupConfig,
  type BackupErrorPayload,
  type BackupEvent,
} from '@b-oss/backup-engine';
import { BrowserPlatformIO } from './browser-platform-io.js';
import { loadToken } from './token-storage.js';
import { loadHandle, queryFsaPermission, requestFsaPermission } from './fsa-persistence.js';

const statusEl = document.getElementById('status')!;
const progressEl = document.getElementById('progress')!;
const backupBtn = document.getElementById('btn-backup') as HTMLButtonElement;
const stopBtn = document.getElementById('btn-stop') as HTMLButtonElement;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function appendProgress(text: string): void {
  progressEl.textContent = (progressEl.textContent ?? '') + text + '\n';
}

function clearProgress(): void {
  progressEl.textContent = '';
}

function describeError(err: BackupErrorPayload): string {
  switch (err.kind) {
    case 'auth_expired':
      return 'Authentication expired — re-authorise via the popup.';
    case 'network':
      return 'Network error — check your connection.';
    case 'api_error':
      return `API error ${err.code}: ${err.message}`;
    case 'filesystem':
      return `Filesystem error: ${err.message}`;
  }
}

let activeEngine: BackupEngine | null = null;

async function init(): Promise<void> {
  const token = await loadToken();
  if (!token) {
    setStatus('Not signed in. Use the b-ark popup to sign in first.');
    return;
  }

  const handle = await loadHandle();
  if (!handle) {
    setStatus(`Signed in as ${token.username}. No backup folder chosen — use the popup.`);
    return;
  }

  const perm = await queryFsaPermission(handle);
  if (perm === null) {
    setStatus(
      `Signed in as ${token.username}. Backup folder handle is stale — pick again via the popup.`,
    );
    return;
  }

  if (perm === 'granted') {
    setStatus(`Ready · ${token.username} · folder: ${handle.name}`);
  } else {
    setStatus(
      `Signed in as ${token.username} · folder: ${handle.name} (needs permission re-grant)`,
    );
    backupBtn.textContent = 'Grant access & back up';
  }
  backupBtn.disabled = false;
}

backupBtn.addEventListener('click', () => {
  void runBackup();
});

stopBtn.addEventListener('click', () => {
  activeEngine?.cancel();
});

async function runBackup(): Promise<void> {
  backupBtn.disabled = true;
  stopBtn.disabled = false;
  clearProgress();

  const token = await loadToken();
  if (!token) {
    setStatus('Not signed in.');
    backupBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }

  const handle = await loadHandle();
  if (!handle) {
    setStatus('No backup folder.');
    backupBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }

  // Re-check + request FSA permission — must be inside a user-gesture handler.
  let perm = await queryFsaPermission(handle);
  if (perm !== 'granted') {
    perm = await requestFsaPermission(handle);
  }
  if (perm !== 'granted') {
    setStatus('Folder access denied — backup cannot run.');
    backupBtn.textContent = 'Grant access & back up';
    backupBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }
  backupBtn.textContent = 'Back up now';

  appendProgress('Fetching profile…');
  const client = new BlipfotoClient(token.accessToken);
  let journalTitle = token.username;
  let avatarUrl = '';
  try {
    const profile = await client.getUserProfile({ username: token.username, returnDetails: true });
    journalTitle = profile.details?.journal_title ?? token.username;
    avatarUrl = profile.user.avatar_url;
  } catch {
    appendProgress('Could not fetch profile — continuing with defaults.');
  }

  const io = new BrowserPlatformIO(handle);
  const logMgr = new LogManager(io, '');

  // backup_folder is "" because BrowserPlatformIO is already rooted at the chosen handle.
  // The engine computes journalFolder = joinPath("", username) → "/username" → segments ["username"].
  const config: AccountBackupConfig = {
    id: token.username,
    username: token.username,
    journal_title: journalTitle,
    avatar_url: avatarUrl,
    access_token: token.accessToken,
    backup_folder: '',
    redo_count: 7,
    gap_check_days: 30,
    api_delay_ms: 500,
    app_version: __APP_VERSION__,
  };

  let eventHandled = false;

  function onEvent(event: BackupEvent): void {
    switch (event.type) {
      case 'started':
        appendProgress(`Backup started (${event.kind}) — ${event.total_to_fetch} entries total`);
        break;
      case 'progress': {
        const phase = event.phase ? ` [${event.phase}]` : '';
        appendProgress(`${event.done}/${event.total} · ${event.current_date}${phase}`);
        break;
      }
      case 'rate_limited':
        appendProgress(`Rate limited — resuming in ${event.resume_in_seconds}s…`);
        break;
      case 'completed':
        appendProgress(`✓ Backup complete — ${event.total_archived} entries archived`);
        eventHandled = true;
        break;
      case 'failed':
        appendProgress(`✗ Backup failed: ${describeError(event.error)}`);
        eventHandled = true;
        break;
    }
  }

  const engine = new BackupEngine(config, io, client, onEvent, logMgr);
  activeEngine = engine;

  try {
    await engine.run();
  } catch {
    if (!eventHandled) {
      appendProgress('✗ Backup stopped.');
    }
  } finally {
    activeEngine = null;
    backupBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

void init();
