// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Notifications section. Three independent pieces, each with its own persistence model
// (the spec's own table: "Master switch/interval — notification service; toggles — server"):
//
//   - **Master switch** — a token action, not a content write (rules.md), so it's available
//     regardless of sign-in mode and applies immediately, no Save. Reuses
//     flows/accountsFlow.ts's changeAccountMode() exactly as SCR-30's own "Turn notifications
//     on/off" button already does (AccountsScreen.tsx) — same FLW-22 logic, now wired to a real
//     `b-push` registration underneath it (Phase 9).
//   - **Feed / Push toggle groups** — server-backed (`user/settings/notifications`), Save/Cancel
//     like General/Journal/Profile-username. The push group only renders when the master switch
//     is on (spec: "not shown-disabled, not present at all"). Event keys are whatever the server
//     returns (`NotificationChannel.settings`, a plain `Record<string, 0|1>` — b-api defines no
//     fixed list, see data/settings.ts's header comment), humanised for display. A successful save
//     also pings b-push's `refresh-preferences` (FLW-17 step 4) — best-effort, no retry, per
//     notification-service.md.
//   - **Advanced polling interval** — persisted locally (devicePrefsStore, floor of 5 minutes
//     client-side) and, once this account has a live `b-push` registration, also PATCHed there
//     (the server enforces the same floor regardless of what's sent). Without a registration yet
//     (master switch never turned on) the control still works, purely locally — there's nothing
//     to PATCH until one exists.

import { useEffect, useState } from 'react';
import { IonButton, IonCheckbox, IonSpinner, IonText, IonNote } from '@ionic/react';
import {
  fetchNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from '../../../data/settings.js';
import { describeError, mapApiError } from '../../../data/errors.js';
import { useActiveAccount } from '../../../state/accountsStore.js';
import { changeAccountMode } from '../../../flows/accountsFlow.js';
import { pingRefreshPreferences, updatePollingInterval } from '../../../flows/pushFlow.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';

function humanize(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function ToggleGroup({
  title,
  settings,
  disabled,
  onChange,
}: {
  title: string;
  settings: Record<string, 0 | 1>;
  disabled: boolean;
  onChange: (key: string, value: 0 | 1) => void;
}) {
  const keys = Object.keys(settings);
  if (keys.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h3>{title}</h3>
      {keys.map((key) => (
        <IonCheckbox
          key={key}
          checked={settings[key] === 1}
          disabled={disabled}
          onIonChange={(e) => onChange(key, e.detail.checked ? 1 : 0)}
        >
          {humanize(key)}
        </IonCheckbox>
      ))}
    </div>
  );
}

export function NotificationsSection() {
  const activeAccount = useActiveAccount();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<NotificationSettings | null>(null);
  const [feed, setFeed] = useState<Record<string, 0 | 1>>({});
  const [push, setPush] = useState<Record<string, 0 | 1>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [masterBusy, setMasterBusy] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const pollingInterval = useDevicePrefsStore((s) => s.notificationPollingIntervalMinutes);
  const setPollingInterval = useDevicePrefsStore((s) => s.setNotificationPollingIntervalMinutes);
  const [intervalError, setIntervalError] = useState<string | null>(null);

  const masterOn = activeAccount?.hasServiceToken ?? false;

  useEffect(() => {
    let cancelled = false;
    fetchNotificationSettings().then(
      (settings) => {
        if (cancelled) return;
        setInitial(settings);
        setFeed(settings.feed?.settings ?? {});
        setPush(settings.push?.settings ?? {});
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        const outcome = mapApiError(err);
        setLoadError(describeError(outcome, 'Could not load notification settings.'));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggleMaster(): Promise<void> {
    if (!activeAccount || masterBusy) return;
    setMasterBusy(true);
    setMasterError(null);
    try {
      await changeAccountMode(activeAccount.id, {
        scope: activeAccount.appTokenScope ?? 'read,write',
        notifications: !masterOn,
      });
    } catch (err) {
      const outcome = mapApiError(err);
      setMasterError(describeError(outcome, 'Could not change notifications.'));
    } finally {
      setMasterBusy(false);
    }
  }

  const dirty =
    !!initial &&
    (JSON.stringify(feed) !== JSON.stringify(initial.feed?.settings ?? {}) ||
      JSON.stringify(push) !== JSON.stringify(initial.push?.settings ?? {}));

  async function handleSave(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await saveNotificationSettings({ ...feed, ...(masterOn ? push : {}) });
      // FLW-17 step 4: a successful save also pings the notification service to refresh its
      // cached preferences immediately — best-effort, no retry (notification-service.md).
      if (activeAccount) void pingRefreshPreferences(activeAccount.id);
      setInitial({
        feed: { configured: 1, settings: feed },
        push: { configured: 1, settings: push },
      });
      setSaved(true);
    } catch (err) {
      const outcome = mapApiError(err);
      setSaveError(describeError(outcome, 'Could not save these changes.'));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel(): void {
    setFeed(initial?.feed?.settings ?? {});
    setPush(initial?.push?.settings ?? {});
    setSaveError(null);
    setSaved(false);
  }

  async function handlePollingIntervalChange(minutes: number): Promise<void> {
    const previous = pollingInterval;
    setPollingInterval(minutes); // local, immediate — matches every other local-only prefs field
    setIntervalError(null);
    // No live registration yet (master switch never turned on) — the control is still
    // meaningfully local-only in that state, so there's nothing to PATCH.
    if (!activeAccount?.notificationRegistrationId) return;
    try {
      await updatePollingInterval(activeAccount.id, minutes);
    } catch (err) {
      // A genuine PATCH failure against an existing registration is worth showing, so the local
      // value is rolled back to match. Not mapApiError() here — that maps b-api's own error
      // shapes (BlipfotoError/NetworkError), not b-push's (data/pushService.ts's PushServiceError).
      setPollingInterval(previous);
      setIntervalError(
        err instanceof Error ? err.message : 'Could not update the polling interval.',
      );
    }
  }

  return (
    <div className="ion-padding">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Push notifications</span>
        <IonButton
          fill="outline"
          disabled={!activeAccount || masterBusy}
          onClick={() => void handleToggleMaster()}
        >
          {masterBusy ? <IonSpinner name="dots" /> : masterOn ? 'On' : 'Off'}
        </IonButton>
      </div>
      {masterError && (
        <IonText color="danger">
          <p>{masterError}</p>
        </IonText>
      )}

      {loading ? (
        <IonSpinner />
      ) : loadError ? (
        <IonText color="danger">
          <p>{loadError}</p>
        </IonText>
      ) : (
        <>
          {saveError && (
            <IonText color="danger">
              <p>{saveError}</p>
            </IonText>
          )}
          {saved && !dirty && <IonNote color="success">Saved.</IonNote>}

          <ToggleGroup
            title="Feed"
            settings={feed}
            disabled={false}
            onChange={(key, value) => setFeed({ ...feed, [key]: value })}
          />

          {masterOn && (
            <ToggleGroup
              title="Push"
              settings={push}
              disabled={false}
              onChange={(key, value) => setPush({ ...push, [key]: value })}
            />
          )}

          {dirty && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <IonButton disabled={saving} onClick={() => void handleSave()}>
                {saving ? <IonSpinner name="dots" /> : 'Save'}
              </IonButton>
              <IonButton fill="outline" disabled={saving} onClick={handleCancel}>
                Cancel
              </IonButton>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              style={{ background: 'none', border: 'none', font: 'inherit', padding: 0 }}
            >
              Advanced {advancedOpen ? '▾' : '▸'}
            </button>
            {advancedOpen && (
              <div style={{ marginTop: 8 }}>
                <label>
                  Check for new activity every:
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={pollingInterval}
                    onChange={(e) => void handlePollingIntervalChange(Number(e.target.value))}
                    style={{ font: 'inherit', marginLeft: 8, width: 64 }}
                  />
                  minutes
                </label>
                {intervalError && (
                  <IonText color="danger">
                    <p>{intervalError}</p>
                  </IonText>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
