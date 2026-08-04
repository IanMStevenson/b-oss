// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Reminders section (FLW-18). Per read-write account — switching the active account shows
// that account's own on/off + time, same shape as devicePrefsStore.reminders itself. Local only,
// no Save/Cancel: every change persists immediately via flows/reminderFlow.ts's
// setReminderEnabled(), which also (re)schedules the OS notification — there's nothing to discard.
// Hidden entirely by the parent SettingsScreen for a read-only account (it can't publish, so a
// publish reminder has nothing to lead to) — this component assumes a read-write active account.

import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { useActiveAccount } from '../../../state/accountsStore.js';
import { setReminderEnabled } from '../../../flows/reminderFlow.js';
import { IonCheckbox, IonText } from '@ionic/react';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function RemindersSection() {
  const activeAccount = useActiveAccount();
  const reminders = useDevicePrefsStore((s) => s.reminders);
  const setting = activeAccount ? reminders[activeAccount.id] : undefined;

  if (!activeAccount) {
    return (
      <IonText color="medium">
        <p>No account selected.</p>
      </IonText>
    );
  }

  const enabled = setting?.enabled ?? false;
  const hour = setting?.hour ?? 20;
  const minute = setting?.minute ?? 0;

  function apply(next: { enabled: boolean; hour: number; minute: number }): void {
    if (!activeAccount) return;
    void setReminderEnabled(activeAccount.id, next.enabled, {
      hour: next.hour,
      minute: next.minute,
    });
  }

  return (
    <div className="ion-padding">
      <p>A daily nudge to publish, for {activeAccount.username}.</p>
      <IonCheckbox
        checked={enabled}
        onIonChange={(e) => apply({ enabled: e.detail.checked, hour, minute })}
      >
        Daily reminder
      </IonCheckbox>

      {enabled && (
        <div style={{ marginTop: 12 }}>
          <label>
            Time
            <select
              aria-label="Reminder hour"
              value={hour}
              onChange={(e) => apply({ enabled, hour: Number(e.target.value), minute })}
              style={{ font: 'inherit', marginLeft: 8 }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {pad(h)}
                </option>
              ))}
            </select>
            :
            <select
              aria-label="Reminder minute"
              value={minute}
              onChange={(e) => apply({ enabled, hour, minute: Number(e.target.value) })}
              style={{ font: 'inherit' }}
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {pad(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
