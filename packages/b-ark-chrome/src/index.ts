// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import {
  loadHandle,
  saveHandle,
  queryFsaPermission,
  requestFsaPermission,
} from './fsa-persistence.js';
import { loadToken } from './token-storage.js';

const statusEl = document.getElementById('status')!;
const signinBtn = document.getElementById('btn-signin') as HTMLButtonElement;
const folderBtn = document.getElementById('btn-folder') as HTMLButtonElement;
const backupNowBtn = document.getElementById('btn-backup-now') as HTMLButtonElement;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function appendStatus(text: string): void {
  statusEl.textContent = (statusEl.textContent ?? '') + '\n' + text;
}

async function init(): Promise<void> {
  setStatus('');

  const token = await loadToken();
  if (token) {
    appendStatus(`Signed in as ${token.username} ✓`);
  } else {
    appendStatus('Not signed in.');
  }

  const handle = await loadHandle();
  let folderReady = false;
  if (handle) {
    const perm = await queryFsaPermission(handle);
    if (perm === null) {
      appendStatus('Backup folder: stale handle — pick again.');
      folderBtn.textContent = 'Pick backup folder';
    } else if (perm === 'granted') {
      appendStatus(`Backup folder: ${handle.name} ✓`);
      folderReady = true;
    } else {
      appendStatus(`Backup folder: ${handle.name} (needs re-grant)`);
      folderBtn.textContent = 'Re-grant folder access';
    }
  } else {
    appendStatus('No backup folder chosen.');
  }

  if (token && folderReady) {
    backupNowBtn.disabled = false;
  }

  // Watch for OAuth result written to chrome.storage by the service worker
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('oauthStatus' in changes)) return;
    const newStatus = changes['oauthStatus']?.newValue as string | undefined;
    if (newStatus === 'success') {
      const username = changes['username']?.newValue as string | undefined;
      setStatus(`Signed in as ${username ?? '?'} ✓`);
      // token already encrypted to IDB by oauth.ts → storeToken; clear temp keys
      void chrome.storage.local.remove(['oauthStatus', 'username', 'via']);
    } else if (newStatus === 'error') {
      const errMsg = changes['oauthError']?.newValue as string | undefined;
      setStatus(`Sign-in failed: ${errMsg ?? 'unknown error'}`);
      void chrome.storage.local.remove(['oauthStatus', 'oauthError']);
    }
  });
}

signinBtn.addEventListener('click', () => {
  setStatus('Opening Blipfoto sign-in…');
  void chrome.runtime.sendMessage({ type: 'start_oauth' });
});

folderBtn.addEventListener('click', () => {
  void (async () => {
    const existing = await loadHandle();
    if (existing) {
      const perm = await queryFsaPermission(existing);
      if (perm !== 'granted') {
        const after = await requestFsaPermission(existing);
        if (after === 'granted') {
          setStatus(`Backup folder: ${existing.name} ✓ (re-granted)`);
          folderBtn.textContent = 'Pick backup folder';
          return;
        }
      } else {
        setStatus(`Backup folder: ${existing.name} ✓`);
        return;
      }
    }
    // Fresh pick
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveHandle(dir);
      setStatus(`Backup folder: ${dir.name} ✓`);
      folderBtn.textContent = 'Pick backup folder';
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') {
        setStatus(`Folder pick failed: ${(e as Error).message}`);
      }
    }
  })();
});

backupNowBtn.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'open_backup_page' });
});

void init();
