// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useState } from 'react';
import { FolderOpen, CheckCircle, AlertTriangle } from 'lucide-react';
import type { AccountConfig, BackendContext } from '@b-oss/b-ark-ui-components';
import { SplitButton } from '@b-oss/b-ark-ui-components';
import { loadHandle, queryFsaPermission, requestFsaPermission } from './fsa-persistence.js';
import { clearError } from './status-storage.js';

interface SettingsOverlayProps {
  backend: BackendContext;
  account: AccountConfig;
  onClose: () => void;
}

function PillToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          display: 'inline-block',
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? 'var(--green-700)' : 'var(--line)',
          position: 'relative',
          transition: 'background 150ms',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'white',
            transition: 'left 150ms',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </span>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 13,
  background: 'white',
  color: 'var(--ink)',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 8px',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 13,
  background: 'white',
  color: 'var(--ink)',
  cursor: 'pointer',
  outline: 'none',
};

function focusRingStyle(focused: boolean): React.CSSProperties {
  return focused
    ? { borderColor: 'var(--green-700)', boxShadow: '0 0 0 3px rgba(31,77,58,0.12)' }
    : {};
}

function SettingBlock({
  label,
  hint,
  description,
  children,
}: {
  label: string;
  hint?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: description ? 6 : 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</span>}
      </div>
      {description && (
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

export function SettingsOverlay({ backend, account, onClose }: SettingsOverlayProps) {
  const [permState, setPermState] = useState<PermissionState | null>(null);
  const [backupOnPublish, setBackupOnPublish] = useState(false);
  const [chipEnabled, setChipEnabled] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(account.schedule.enabled ?? true);
  const [interval, setIntervalVal] = useState<'daily' | 'weekly'>(
    account.schedule.interval === 'monthly' ? 'weekly' : account.schedule.interval,
  );
  const [gapCheckDays, setGapCheckDays] = useState(account.gap_check_days ?? 30);
  const [redoCount, setRedoCount] = useState(account.redo_count ?? 7);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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

  useEffect(() => {
    chrome.storage.local.get(['backup_on_publish', 'chip_enabled'], (r) => {
      setBackupOnPublish(r['backup_on_publish'] === true);
      setChipEnabled(r['chip_enabled'] !== false);
    });
  }, []);

  // Re-sync when account prop changes (e.g. after backend emits store:changed)
  useEffect(() => {
    setScheduleEnabled(account.schedule.enabled ?? true);
    setIntervalVal(account.schedule.interval === 'monthly' ? 'weekly' : account.schedule.interval);
    setGapCheckDays(account.gap_check_days ?? 30);
    setRedoCount(account.redo_count ?? 7);
  }, [account]);

  async function handleGrantPermission(): Promise<void> {
    const handle = await loadHandle();
    if (!handle) return;
    const perm = await requestFsaPermission(handle);
    setPermState(perm);
    if (perm === 'granted') {
      await clearError();
    }
  }

  function save(partial: Parameters<typeof backend.updateSettings>[0]): void {
    backend.updateSettings(partial).catch(() => {});
  }

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
          style={{
            height: 30,
            padding: '0 14px',
            borderRadius: 7,
            background: 'var(--green-800)',
            color: 'white',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Done
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {/* Backup folder */}
          <SettingBlock label="Backup folder" hint="Where backups are stored">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
          </SettingBlock>

          {/* Show chip */}
          <SettingBlock
            label="Show chip"
            description="Display the floating b-ark status indicator on Blipfoto pages. Turn off to hide it — backups still run in the background."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PillToggle
                checked={chipEnabled}
                onChange={(v) => {
                  setChipEnabled(v);
                  void chrome.storage.local.set({ chip_enabled: v });
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {chipEnabled ? 'On' : 'Off'}
              </span>
            </div>
          </SettingBlock>

          {/* Backup on visit */}
          <SettingBlock
            label="Backup on visit"
            description="On each Blipfoto page visit, b-ark-chrome checks whether a backup is due and starts one silently in the background."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <PillToggle
                  checked={scheduleEnabled}
                  onChange={(v) => {
                    setScheduleEnabled(v);
                    save({ schedule: { ...account.schedule, enabled: v } });
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {scheduleEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: scheduleEnabled ? 1 : 0.4,
                  pointerEvents: scheduleEnabled ? 'auto' : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--muted)',
                    width: 38,
                    flexShrink: 0,
                  }}
                >
                  Every
                </span>
                <select
                  value={interval}
                  onChange={(e) => {
                    const v = e.target.value as 'daily' | 'weekly';
                    setIntervalVal(v);
                    save({ schedule: { ...account.schedule, interval: v } });
                  }}
                  style={{ ...selectStyle, width: 120 }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
          </SettingBlock>

          {/* Backup on publish */}
          <SettingBlock
            label="Backup on publish"
            description="Start a backup immediately when you publish or save an entry on Blipfoto."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PillToggle
                checked={backupOnPublish}
                onChange={(v) => {
                  setBackupOnPublish(v);
                  void chrome.storage.local.set({ backup_on_publish: v });
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {backupOnPublish ? 'On' : 'Off'}
              </span>
            </div>
          </SettingBlock>

          {/* Gap check */}
          <SettingBlock
            label="Gap check"
            hint="Days to look back"
            description="On each run, look back this many days and fill in any missing entries."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={gapCheckDays}
                min={0}
                onChange={(e) => setGapCheckDays(parseInt(e.target.value, 10) || 0)}
                onFocus={() => setFocusedField('gap')}
                onBlur={() => {
                  setFocusedField(null);
                  save({ gap_check_days: gapCheckDays });
                }}
                style={{
                  ...inputStyle,
                  width: 80,
                  ...(focusedField === 'gap' ? focusRingStyle(true) : {}),
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>days</span>
            </div>
          </SettingBlock>

          {/* Redo */}
          <SettingBlock
            label="Redo"
            hint="Most-recent entries to refresh"
            description="Re-download this many of the latest entries each run, in case captions or comments have changed."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={redoCount}
                min={0}
                onChange={(e) => setRedoCount(parseInt(e.target.value, 10) || 0)}
                onFocus={() => setFocusedField('redo')}
                onBlur={() => {
                  setFocusedField(null);
                  save({ redo_count: redoCount });
                }}
                style={{
                  ...inputStyle,
                  width: 80,
                  ...(focusedField === 'redo' ? focusRingStyle(true) : {}),
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>entries</span>
            </div>
          </SettingBlock>

          {/* Account */}
          <SettingBlock label="Account" description="Your Blipfoto account.">
            <div
              style={{
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
          </SettingBlock>

          {/* Version */}
          <div
            style={{
              padding: '16px 20px',
              fontSize: 12,
              color: 'var(--muted-2)',
            }}
          >
            b-ark-chrome {backend.appVersion}
          </div>
        </div>
      </div>
    </div>
  );
}
