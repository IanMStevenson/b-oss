// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 App Settings → General: the device-local settings that used to be separate Reminders and
// Misc pages, plus the link-handling toggle that used to live on Help. (Not to be confused with
// the Blipfoto account's own "General" page, GeneralSection.tsx — the shared name is deliberate.)
//
// Everything persists immediately, no Save/Cancel. Reminders are per read-write account (switching
// the active account shows its own on/off + time; a read-only account can't publish, so it gets no
// Reminders section); they go through flows/reminderFlow.ts's setReminderEnabled(), which also
// (re)schedules the OS notification. The Misc settings are per device and only matter with two or
// more accounts stored, so that section is hidden below that. Signed out, the page is still
// reachable (the links toggle must work logged out, rules.md): Reminders shows greyed out.

import { IonList } from '@ionic/react';
import {
  CaptionRow,
  SectionHeader,
  SegmentRow,
  TimeRow,
  ToggleRow,
} from '../../../components/SettingsForm.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { useAccountsStore, useActiveAccount } from '../../../state/accountsStore.js';
import { setReminderEnabled } from '../../../flows/reminderFlow.js';

const REMINDER_MINUTES = [0, 15, 30, 45];

function RemindersGroup() {
  const activeAccount = useActiveAccount();
  const reminders = useDevicePrefsStore((s) => s.reminders);
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

  function apply(next: { enabled: boolean; hour: number; minute: number }): void {
    if (!activeAccount) return;
    void setReminderEnabled(activeAccount.id, next.enabled, {
      hour: next.hour,
      minute: next.minute,
    });
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
        label="Daily reminder"
        checked={enabled}
        onChange={(checked) => apply({ enabled: checked, hour, minute })}
      />
      {enabled && (
        <>
          <TimeRow
            label="Reminder time"
            pickerTitle="Reminder time"
            hour={hour}
            minute={minute}
            minuteValues={REMINDER_MINUTES}
            onChange={(t) => apply({ enabled, hour: t.hour, minute: t.minute })}
          />
        </>
      )}
    </>
  );
}

function MultiAccountGroup() {
  const confirmAccountBeforeReaction = useDevicePrefsStore((s) => s.confirmAccountBeforeReaction);
  const setConfirmAccountBeforeReaction = useDevicePrefsStore(
    (s) => s.setConfirmAccountBeforeReaction,
  );
  const accountAvatarStyle = useDevicePrefsStore((s) => s.accountAvatarStyle);
  const setAccountAvatarStyle = useDevicePrefsStore((s) => s.setAccountAvatarStyle);
  const accountCount = useAccountsStore((s) => s.accounts.length);
  if (accountCount < 2) return null;

  return (
    <>
      <SectionHeader>Multiple accounts</SectionHeader>
      <ToggleRow
        label="Confirm account before star, favourite or comment"
        caption="Ask which account to act as before each of these actions, instead of silently using whichever is active."
        checked={confirmAccountBeforeReaction}
        onChange={setConfirmAccountBeforeReaction}
      />
      <SegmentRow
        label="Account picture"
        value={accountAvatarStyle}
        options={[
          { value: 'picture', label: 'Profile picture' },
          { value: 'icon', label: 'Icon' },
        ]}
        onChange={setAccountAvatarStyle}
      />
      <CaptionRow>How each account is shown in the switcher and header.</CaptionRow>
    </>
  );
}

export function AppGeneralSection() {
  const openLinksInApp = useDevicePrefsStore((s) => s.openBlipfotoLinksInApp);
  const setOpenLinksInApp = useDevicePrefsStore((s) => s.setOpenBlipfotoLinksInApp);

  return (
    <IonList>
      <RemindersGroup />
      <MultiAccountGroup />
      <SectionHeader>Links</SectionHeader>
      <ToggleRow
        label="Open blipfoto.com links in this app"
        checked={openLinksInApp}
        onChange={setOpenLinksInApp}
      />
    </IonList>
  );
}
