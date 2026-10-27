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
// reachable (the links toggle must work logged out): Reminders shows greyed out.
//
// Turning the reminder on asks for the notification permission (Android 13+). A refusal, or a
// scheduling error, leaves it stored as off and says why under the toggle (b-oss#389).

import { useState } from 'react';
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

function AppearanceGroup() {
  const theme = useDevicePrefsStore((s) => s.theme);
  const setTheme = useDevicePrefsStore((s) => s.setTheme);
  return (
    <>
      <SectionHeader>Appearance</SectionHeader>
      <SegmentRow
        label="Theme"
        value={theme}
        options={[
          { value: 'system', label: 'System default' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'mid', label: 'Mid' },
        ]}
        onChange={setTheme}
      />
      <CaptionRow>
        System default follows your phone&rsquo;s dark theme setting (Light or Dark). Mid is a
        softer dark grey you can choose here.
      </CaptionRow>
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
      <AppearanceGroup />
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
