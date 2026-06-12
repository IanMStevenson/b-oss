// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

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
    backupBtn.disabled = false;
  } else {
    setStatus(
      `Signed in as ${token.username} · folder: ${handle.name} (needs permission re-grant)`,
    );
    backupBtn.disabled = false;
    backupBtn.textContent = 'Grant access & back up';
  }
}

backupBtn.addEventListener('click', () => {
  void runBackup();
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

  // Ensure permission — requestFsaPermission is called from within a click handler (user gesture)
  let perm = await queryFsaPermission(handle);
  if (perm !== 'granted') {
    perm = await requestFsaPermission(handle);
  }
  if (perm !== 'granted') {
    setStatus('Folder access denied — backup cannot run.');
    backupBtn.disabled = false;
    backupBtn.textContent = 'Grant access & back up';
    stopBtn.disabled = true;
    return;
  }
  backupBtn.textContent = 'Back up now';

  appendProgress('Initialising…');
  // Engine wiring will be added in the next commit.
  // For now confirm that init + permission flow works end-to-end.
  appendProgress('(backup engine not yet wired — skeleton only)');
  backupBtn.disabled = false;
  stopBtn.disabled = true;
}

void init();
