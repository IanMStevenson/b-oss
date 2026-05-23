// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState } from 'react';
import { Settings, X, FolderOpen, Trash2 } from 'lucide-react';

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
import type { AccountConfig } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';
import { SplitButton } from '../SplitButton.js';

interface SettingsPanelProps {
  account: AccountConfig;
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
    <div
      style={{
        padding: '18px 20px',
        borderBottom: '1px solid var(--line)',
      }}
    >
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

export function SettingsPanel({ account }: SettingsPanelProps) {
  const { dispatch, backend } = useApp();

  const [folder, setFolder] = useState(account.backup_folder);
  const [scheduleEnabled, setScheduleEnabled] = useState(account.schedule.enabled ?? true);
  const [nextRun, setNextRun] = useState(account.schedule.next_run.slice(0, 10));
  const [hour, setHour] = useState(account.schedule.hour);
  const [interval, setInterval] = useState(account.schedule.interval);
  const [apiDelay, setApiDelay] = useState(account.api_delay_ms);
  const [gapCheck, setGapCheck] = useState(account.gap_check_days);
  const [redo, setRedo] = useState(account.redo_count);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  async function chooseFolder() {
    const picked = await backend.pickFolder();
    if (picked) {
      setFolder(picked);
      await backend.updateAccountSettings(account.id, { backup_folder: picked });
    }
  }

  function save(partial: Partial<AccountConfig>) {
    backend.updateAccountSettings(account.id, partial).catch(() => {
      // silently retry on next blur — non-critical
    });
  }

  async function handleRemove() {
    if (
      window.confirm(
        `Remove "${account.journal_title}" and all its settings? (Backup files on disk will not be deleted.)`,
      )
    ) {
      dispatch({ type: 'panel:close' });
      await backend.removeAccount(account.id);
    }
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
      {/* Panel header */}
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
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>
          Settings &middot; {account.journal_title}
        </span>
        <button
          onClick={() => dispatch({ type: 'panel:close' })}
          aria-label="Close settings"
          style={{ color: 'var(--muted)', display: 'flex', borderRadius: 4, padding: 2 }}
        >
          <X size={16} strokeWidth={1.6} />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Folder */}
          <SettingBlock label="Folder" hint="Where backups are written">
            <div style={{ display: 'flex' }}>
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                onFocus={() => setFocusedField('folder')}
                onBlur={() => {
                  setFocusedField(null);
                  save({ backup_folder: folder });
                }}
                style={{
                  ...monoInputStyle,
                  flex: 1,
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  ...(focusedField === 'folder' ? focusRingStyle(true) : {}),
                }}
              />
              <button
                onClick={() => {
                  void chooseFolder();
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
                Choose…
              </button>
            </div>
          </SettingBlock>

          {/* Schedule */}
          <SettingBlock
            label="Schedule"
            hint="Next run will follow this"
            description="b-ark will check for new entries at this time, and then again every interval."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Enabled toggle */}
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

              {/* Date/Time/Interval — dimmed when schedule is disabled */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  opacity: scheduleEnabled ? 1 : 0.4,
                  pointerEvents: scheduleEnabled ? 'auto' : 'none',
                }}
              >
                {/* Date */}
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
                        const iso = d.toISOString();
                        save({ schedule: { ...account.schedule, next_run: iso } });
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

                {/* Time */}
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
                      save({ schedule: { ...account.schedule, hour: h } });
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

                {/* Interval */}
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
                      save({ schedule: { ...account.schedule, interval: v } });
                    }}
                    style={{ ...selectStyle, width: 120 }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              {/* end dimming wrapper */}
            </div>
          </SettingBlock>

          {/* API Delay */}
          <SettingBlock
            label="Delay"
            description="Pause between each entry fetch (useful to avoid bandwidth hogging during working hours). Default 0."
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

          {/* Gap check */}
          <SettingBlock
            label="Gap check"
            hint="Days to look back"
            description="On each run, look back this many days and fill in any missing entries."
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

          {/* Redo */}
          <SettingBlock
            label="Redo"
            hint="Most-recent entries to refresh"
            description="Re-download this many of the latest entries each run, in case captions or comments have changed since the last backup."
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

          {/* Account actions */}
          <SettingBlock label="Account">
            <div style={{ display: 'flex', gap: 10 }}>
              <SplitButton
                variant="secondary"
                menuDirection="up"
                primaryLabel="Reauthorise"
                onPrimary={() => {
                  void backend.reauthoriseAccount(account.id);
                }}
                menu={[
                  {
                    label: 'Sign in with a different account…',
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
                style={{
                  height: 30,
                  padding: '0 14px',
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
                Remove account
              </button>
            </div>
          </SettingBlock>
        </div>
      </div>
    </div>
  );
}
