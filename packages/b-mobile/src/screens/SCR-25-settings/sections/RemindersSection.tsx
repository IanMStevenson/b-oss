// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 App settings → Reminders: the per-account daily "publish today" reminder, split out of the
// old App → General page (b-oss#734).
//
// Persists immediately, no Save/Cancel. Reminders are per read-write account (switching the active
// account shows its own on/off + time; a read-only account can't publish, so it gets no controls);
// they go through flows/reminderFlow.ts's setReminderEnabled(), which also (re)schedules the OS
// notification. Signed out, the page is still reachable and shows the control greyed out.
//
// Turning the reminder on asks for the notification permission (Android 13+). A refusal, or a
// scheduling error, leaves it stored as off and says why under the toggle (b-oss#389).

import { useState } from 'react';
import { IonList } from '@ionic/react';
import { CaptionRow, SectionHeader, TimeRow, ToggleRow } from '../../../components/SettingsForm.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { useActiveAccount } from '../../../state/accountsStore.js';
import { setReminderEnabled } from '../../../flows/reminderFlow.js';

const REMINDER_MINUTES = [0, 15, 30, 45];

const REFUSED_MESSAGE =
  'Notifications are off for b-mobile, so the reminder can’t be shown. You can allow them in your phone’s Settings.';
const FAILED_MESSAGE = 'Could not change the reminder. Please try again.';

function RemindersGroup() {
  const activeAccount = useActiveAccount();
  const reminders = useDevicePrefsStore((s) => s.reminders);
  // Tagged with its account so switching accounts doesn't carry the message across.
  const [notice, setNotice] = useState<{ accountId: string; text: string } | null>(null);
  // An Ionic toggle flips itself on tap; if the stored value ends up unchanged (a refusal on a
  // reminder that was already off) React has nothing to re-render, so remount it to snap back.
  const [toggleKey, setToggleKey] = useState(0);
  if (!activeAccount) {
    // Signed out: reminders are per account, so show the control greyed out rather than hide it.
    return (
      <>
        <SectionHeader>Reminders</SectionHeader>
        <CaptionRow>Sign in to set a daily reminder to publish.</CaptionRow>
        <ToggleRow label="Daily reminder" checked={false} disabled onChange={() => {}} />
      </>
    );
  }
  if (activeAccount.appTokenScope !== 'read,write') return null;

  const setting = reminders[activeAccount.id];
  const enabled = setting?.enabled ?? false;
  const hour = setting?.hour ?? 20;
  const minute = setting?.minute ?? 0;

  async function apply(next: { enabled: boolean; hour: number; minute: number }): Promise<void> {
    if (!activeAccount) return;
    const accountId = activeAccount.id;
    setNotice(null);
    try {
      const result = await setReminderEnabled(accountId, next.enabled, {
        hour: next.hour,
        minute: next.minute,
      });
      if (result === 'refused') setNotice({ accountId, text: REFUSED_MESSAGE });
    } catch {
      setNotice({ accountId, text: FAILED_MESSAGE });
    } finally {
      setToggleKey((k) => k + 1);
    }
  }

  return (
    <>
      <SectionHeader>Reminders</SectionHeader>
      <CaptionRow>
        A notification at the time you choose each day, if you haven&rsquo;t published an entry for{' '}
        {activeAccount.username} yet. Publishing or editing an entry in this app skips that
        day&rsquo;s reminder, and tapping it opens a new entry.
      </CaptionRow>
      <ToggleRow
        key={toggleKey}
        label="Daily reminder"
        checked={enabled}
        onChange={(checked) => void apply({ enabled: checked, hour, minute })}
      />
      {notice?.accountId === activeAccount.id && (
        <CaptionRow tone="danger">{notice.text}</CaptionRow>
      )}
      {enabled && (
        <>
          <TimeRow
            label="Reminder time"
            pickerTitle="Reminder time"
            hour={hour}
            minute={minute}
            minuteValues={REMINDER_MINUTES}
            onChange={(t) => void apply({ enabled, hour: t.hour, minute: t.minute })}
          />
        </>
      )}
    </>
  );
}

export function RemindersSection() {
  return (
    <IonList>
      <RemindersGroup />
    </IonList>
  );
}
