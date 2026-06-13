// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useState } from 'react';
import { X, FolderOpen, CheckCircle, AlertTriangle } from 'lucide-react';
import type { AccountConfig, BackendContext } from '@b-oss/b-ark-ui-components';
import { SplitButton } from '@b-oss/b-ark-ui-components';
import { loadHandle, queryFsaPermission, requestFsaPermission } from './fsa-persistence.js';
import { clearError } from './status-storage.js';

interface SettingsOverlayProps {
  backend: BackendContext;
  account: AccountConfig;
  onClose: () => void;
}

export function SettingsOverlay({ backend, account, onClose }: SettingsOverlayProps) {
  const [permState, setPermState] = useState<PermissionState | null>(null);

  useEffect(() => {
    void (async () => {
      const handle = await loadHandle();
      if (!handle) {
        setPermState(null);
        return;
      }
      const perm = await queryFsaPermission(handle);
      setPermState(perm);
    })();
  }, []);

  async function handleGrantPermission(): Promise<void> {
    const handle = await loadHandle();
    if (!handle) return;
    const perm = await requestFsaPermission(handle);
    setPermState(perm);
    if (perm === 'granted') {
      // Folder access restored — clear any stale "Fix access" red on the page + chip.
      await clearError();
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--muted)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Settings</span>
        <button
          onClick={onClose}
          aria-label="Close settings"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
          }}
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {/* Backup folder */}
        <section>
          <div style={labelStyle}>Backup folder</div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <code
              style={{
                flex: 1,
                fontSize: 13,
                color: 'var(--ink)',
                background: 'var(--bg-alt)',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {account.backup_folder || '(not chosen)'}
            </code>
            <button
              onClick={() => {
                void backend.chooseBackupFolder();
              }}
              style={{
                height: 32,
                padding: '0 14px',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--green-700)',
                border: '1px solid var(--line)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexShrink: 0,
              }}
            >
              <FolderOpen size={13} strokeWidth={2} />
              Change
            </button>
          </div>

          {permState !== null && (
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
              }}
            >
              {permState === 'granted' ? (
                <>
                  <CheckCircle size={13} strokeWidth={2} color="var(--rag-green)" />
                  <span style={{ color: 'var(--rag-green)' }}>Folder access granted</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={13} strokeWidth={2} color="var(--rag-amber)" />
                  <span style={{ color: 'var(--rag-amber)' }}>Access needed</span>
                  <button
                    onClick={() => {
                      void handleGrantPermission();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--green-700)',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontWeight: 600,
                      padding: 0,
                    }}
                  >
                    Grant
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* Backup frequency */}
        <section>
          <div style={labelStyle}>Backup frequency</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
            {(['daily', 'weekly'] as const).map((interval) => {
              const active = account.schedule.interval === interval;
              return (
                <label
                  key={interval}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: active ? 'var(--ink)' : 'var(--muted)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <input
                    type="radio"
                    name="b-ark-interval"
                    value={interval}
                    checked={active}
                    onChange={() => {
                      void backend.updateSettings({
                        schedule: { ...account.schedule, interval },
                      });
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  {interval.charAt(0).toUpperCase() + interval.slice(1)}
                </label>
              );
            })}
          </div>
        </section>

        {/* Account */}
        <section>
          <div style={labelStyle}>Account</div>
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
              {account.username}
            </span>
            <SplitButton
              primaryLabel="Reauthorise"
              onPrimary={() => {
                void backend.reauthoriseAccount(account.id);
              }}
              menu={[
                {
                  label: 'Sign in fresh',
                  onSelect: () => {
                    void backend.reauthoriseAccountFresh(account.id);
                  },
                },
              ]}
              variant="secondary"
            />
            <button
              onClick={() => {
                void backend.removeAccount(account.id);
              }}
              style={{
                height: 30,
                padding: '0 12px',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--rag-red)',
                border: '1px solid rgba(208,69,69,0.2)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </section>

        {/* Version */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 16,
            borderTop: '1px solid var(--line)',
            fontSize: 12,
            color: 'var(--muted-2)',
          }}
        >
          b-ark {backend.appVersion}
        </div>
      </div>
    </div>
  );
}
