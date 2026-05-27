// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useState } from 'react';
import { Settings, FolderOpen, Trash2 } from 'lucide-react';
import type { AccountConfig } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';
import { useToast } from '../../hooks/useToast.js';
import { addAccountWithToast } from '../../lib/add-account-with-toast.js';
import { SplitButton } from '../SplitButton.js';

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

const monoInputStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 11.5,
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

function AccountRow({ account }: { account: AccountConfig }) {
  const { dispatch, backend } = useApp();

  async function handleRemove(): Promise<void> {
    if (
      window.confirm(
        `Remove "${account.journal_title}" and all its settings? (Backup files on disk will not be deleted.)`,
      )
    ) {
      dispatch({ type: 'panel:close' });
      await backend.removeAccount(account.id);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderTop: '1px solid var(--line-2)',
      }}
    >
      <img
        src={account.avatar_url}
        alt=""
        style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
          {account.journal_title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>@{account.username}</div>
      </div>
      <SplitButton
        variant="secondary"
        menuDirection="up"
        primaryLabel="Reauthorise"
        onPrimary={() => {
          void backend.reauthoriseAccount(account.id);
        }}
        menu={[
          {
            label: 'Force new sign-in…',
            onSelect: () => {
              void backend.reauthoriseAccountFresh(account.id);
            },
          },
        ]}
      />
      <button
        onClick={() => {
          void handleRemove();
        }}
        title="Remove account"
        style={{
          height: 30,
          padding: '0 10px',
          borderRadius: 7,
          border: '1px solid var(--line)',
          background: 'white',
          color: 'var(--rag-red)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Trash2 size={13} strokeWidth={1.6} />
        Remove
      </button>
    </div>
  );
}

export function SettingsPanel() {
  const { state, dispatch, backend } = useApp();
  const showToast = useToast();

  const store = state.store;

  // Hooks must always run in the same order — guard against an unready store
  // below by short-circuiting render, not by skipping hooks.
  const schedule = store?.accounts[0]?.schedule ?? {
    enabled: true,
    next_run: new Date().toISOString(),
    hour: 2,
    interval: 'daily' as const,
  };
  const firstAcct = store?.accounts[0];

  const [scheduleEnabled, setScheduleEnabled] = useState(schedule.enabled ?? true);
  const [nextRun, setNextRun] = useState(schedule.next_run.slice(0, 10));
  const [hour, setHour] = useState(schedule.hour);
  const [interval, setInterval] = useState(schedule.interval);
  const [apiDelay, setApiDelay] = useState(firstAcct?.api_delay_ms ?? 0);
  const [gapCheck, setGapCheck] = useState(firstAcct?.gap_check_days ?? 31);
  const [redo, setRedo] = useState(firstAcct?.redo_count ?? 7);
  const [startWithWindows, setStartWithWindows] = useState(store?.app.startWithWindows ?? true);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(store?.app.autoUpdateEnabled ?? true);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Re-sync local state when the store changes externally (e.g. after a folder
  // change adopts a new portable file with different shared settings).
  useEffect(() => {
    if (!store?.accounts[0]) return;
    const a = store.accounts[0];
    setScheduleEnabled(a.schedule.enabled);
    setNextRun(a.schedule.next_run.slice(0, 10));
    setHour(a.schedule.hour);
    setInterval(a.schedule.interval);
    setApiDelay(a.api_delay_ms);
    setGapCheck(a.gap_check_days);
    setRedo(a.redo_count);
    setStartWithWindows(store.app.startWithWindows);
    setAutoUpdateEnabled(store.app.autoUpdateEnabled);
  }, [store]);

  if (!store) return null;

  const backupFolder = store.accounts[0]?.backup_folder ?? '';

  function save(partial: Parameters<typeof backend.updateSettings>[0]): void {
    backend.updateSettings(partial).catch(() => {
      /* silently retry on next blur — non-critical */
    });
  }

  async function moveFolder(): Promise<void> {
    const picked = await backend.pickFolder();
    if (!picked) return;
    if (picked === backupFolder) return;
    if (
      !window.confirm(
        `Move b-ark settings to:\n${picked}\n\nThis writes b-ark-settings.json into the new folder. Existing backup files on disk are NOT moved — you must move them manually.`,
      )
    ) {
      return;
    }
    try {
      await backend.moveBackupFolder(picked);
      showToast('info', `Backup folder set to ${picked}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to move folder';
      showToast('error', message);
    }
  }

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
        <Settings size={16} strokeWidth={1.6} color="var(--green-800)" />
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Settings</span>
        <button
          onClick={() => dispatch({ type: 'panel:close' })}
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

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Folder */}
          <SettingBlock
            label="Folder"
            hint="Where backups and settings are stored"
            description="b-ark-settings.json lives here so your setup follows the folder between machines. Moving the folder updates the pointer only — existing backup files are not moved."
          >
            <div style={{ display: 'flex' }}>
              <input
                type="text"
                value={backupFolder}
                readOnly
                style={{
                  ...monoInputStyle,
                  flex: 1,
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  background: 'var(--bg-alt)',
                }}
              />
              <button
                onClick={() => {
                  void moveFolder();
                }}
                style={{
                  height: 32,
                  padding: '0 12px',
                  border: '1px solid var(--line)',
                  borderLeft: 'none',
                  borderTopRightRadius: 6,
                  borderBottomRightRadius: 6,
                  background: 'var(--bg-alt)',
                  color: 'var(--ink-2)',
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FolderOpen size={13} strokeWidth={1.6} />
                Move folder…
              </button>
            </div>
          </SettingBlock>

          {/* Schedule */}
          <SettingBlock
            label="Schedule"
            hint="Shared across all journals"
            description="When the timer fires, every journal is backed up sequentially in account order."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <PillToggle
                  checked={scheduleEnabled}
                  onChange={(v) => {
                    setScheduleEnabled(v);
                    save({ schedule: { ...schedule, enabled: v } });
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {scheduleEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  opacity: scheduleEnabled ? 1 : 0.4,
                  pointerEvents: scheduleEnabled ? 'auto' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                    Date
                  </span>
                  <input
                    type="text"
                    value={nextRun}
                    onChange={(e) => setNextRun(e.target.value)}
                    onFocus={() => setFocusedField('date')}
                    onBlur={() => {
                      setFocusedField(null);
                      const d = new Date(nextRun);
                      if (!isNaN(d.getTime())) {
                        save({ schedule: { ...schedule, next_run: d.toISOString() } });
                      }
                    }}
                    placeholder="YYYY-MM-DD"
                    style={{
                      ...monoInputStyle,
                      width: 140,
                      ...(focusedField === 'date' ? focusRingStyle(true) : {}),
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                    Time
                  </span>
                  <select
                    value={hour}
                    onChange={(e) => {
                      const h = parseInt(e.target.value, 10);
                      setHour(h);
                      save({ schedule: { ...schedule, hour: h } });
                    }}
                    style={{ ...selectStyle, width: 100 }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                      const v = e.target.value as 'daily' | 'weekly' | 'monthly';
                      setInterval(v);
                      save({ schedule: { ...schedule, interval: v } });
                    }}
                    style={{ ...selectStyle, width: 120 }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
            </div>
          </SettingBlock>

          <SettingBlock
            label="Delay"
            description="Pause between each entry fetch (useful to avoid bandwidth hogging during working hours). Default 0. Shared across all journals."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={apiDelay}
                min={0}
                onChange={(e) => setApiDelay(parseInt(e.target.value, 10) || 0)}
                onFocus={() => setFocusedField('delay')}
                onBlur={() => {
                  setFocusedField(null);
                  save({ api_delay_ms: apiDelay });
                }}
                style={{
                  ...inputStyle,
                  width: 80,
                  ...(focusedField === 'delay' ? focusRingStyle(true) : {}),
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>ms</span>
            </div>
          </SettingBlock>

          <SettingBlock
            label="Gap check"
            hint="Days to look back"
            description="On each run, look back this many days and fill in any missing entries. Shared across all journals."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={gapCheck}
                min={0}
                onChange={(e) => setGapCheck(parseInt(e.target.value, 10) || 0)}
                onFocus={() => setFocusedField('gap')}
                onBlur={() => {
                  setFocusedField(null);
                  save({ gap_check_days: gapCheck });
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

          <SettingBlock
            label="Redo"
            hint="Most-recent entries to refresh"
            description="Re-download this many of the latest entries each run, in case captions or comments have changed. Shared across all journals."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={redo}
                min={0}
                onChange={(e) => setRedo(parseInt(e.target.value, 10) || 0)}
                onFocus={() => setFocusedField('redo')}
                onBlur={() => {
                  setFocusedField(null);
                  save({ redo_count: redo });
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

          <SettingBlock
            label="Start with Windows"
            description="Open b-ark automatically on login. It stays in the system tray until you open it."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PillToggle
                checked={startWithWindows}
                onChange={(v) => {
                  setStartWithWindows(v);
                  save({ startWithWindows: v });
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {startWithWindows ? 'On' : 'Off'}
              </span>
            </div>
          </SettingBlock>

          <SettingBlock
            label="Check for updates automatically"
            description="At startup, b-ark checks GitHub for a newer release and offers to install it. Turn off if you'd rather update manually. Takes effect at next launch."
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PillToggle
                checked={autoUpdateEnabled}
                onChange={(v) => {
                  setAutoUpdateEnabled(v);
                  save({ autoUpdateEnabled: v });
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {autoUpdateEnabled ? 'On' : 'Off'}
              </span>
            </div>
          </SettingBlock>

          <SettingBlock label="Accounts" description="Each Blipfoto account is one journal.">
            {store.accounts.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>
                No accounts yet — add one below.
              </div>
            )}
            {store.accounts.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
            <div style={{ marginTop: 12 }}>
              <SplitButton
                variant="secondary"
                menuDirection="up"
                primaryLabel="+ Add another account"
                onPrimary={() => {
                  void addAccountWithToast(() => backend.addAccount(), showToast);
                }}
                menu={[
                  {
                    label: 'Force new sign-in…',
                    onSelect: () => {
                      void addAccountWithToast(() => backend.addAccountFresh(), showToast);
                    },
                  },
                ]}
              />
            </div>
          </SettingBlock>
        </div>
      </div>
    </div>
  );
}
