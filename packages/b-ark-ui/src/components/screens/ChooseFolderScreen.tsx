// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { FolderOpen, Cloud } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { useToast } from '../../hooks/useToast.js';

export function ChooseFolderScreen() {
  const { backend, dispatch } = useApp();
  const showToast = useToast();

  async function pickFolder(): Promise<void> {
    try {
      const result = await backend.chooseBackupFolder();
      if (!result) return;
      if (result.existingSettings) {
        showToast('info', `Loaded settings from ${result.folder}.`);
      }
      // Refresh boot state so we move on to first-account or ready.
      const next = await backend.getBootState();
      dispatch({ type: 'boot:resolved', state: next });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to set backup folder';
      showToast('error', message);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'var(--green-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          <FolderOpen size={28} strokeWidth={1.6} color="var(--green-800)" />
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.015em',
            color: 'var(--ink)',
            marginBottom: 12,
          }}
        >
          Pick a backup folder
        </h1>

        <p
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          b-ark stores backups and a portable settings file in this folder. Pick a folder you
          control — and if you want your setup to follow you between machines, pick one inside a
          cloud-synced drive like Dropbox or OneDrive.
        </p>

        <button
          onClick={() => {
            void pickFolder();
          }}
          style={{
            width: '100%',
            height: 38,
            borderRadius: 10,
            border: 'none',
            background: 'var(--green-700)',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <FolderOpen size={15} strokeWidth={1.8} />
          Choose folder…
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--muted)',
            fontSize: 12,
          }}
        >
          <Cloud size={13} strokeWidth={1.6} />
          <span>If b-ark-settings.json already exists in the folder, it will be loaded.</span>
        </div>
      </div>
    </div>
  );
}
