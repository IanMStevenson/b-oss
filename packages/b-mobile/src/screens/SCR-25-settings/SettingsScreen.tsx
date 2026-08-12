// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 — Settings (FLW-17). One component, not eight separate SCR-numbered screens (the spec's
// own "every setting lives on this one screen rather than in separate sub-screens") — the hub
// lists rows, each pushing to `/settings/:section` (AppRoutes.tsx), which mounts this same
// component with `section` set; each section is its own file under `sections/` for size, not a
// new screen identity. Reached only via AppShell's nav item, which is itself only rendered when
// an account is active (rules.md: "Account-gated") — no separate guard needed here, matching
// every other account-scoped screen in this app (e.g. SCR-20/21's own lack of one).
//
// The hub fetches `user/settings` once, for itself: the Refused followers row's visibility
// ("only for a protected journal") needs to know the *current* privacy value, and rules.md's "no
// caching for display" means this has to be a fresh fetch on every visit to the hub, not a value
// remembered from whichever section screen last saved it — a direct instance of "screens refetch,
// never depend on a prior screen's data" (see useAppNavigate.ts's own doc comment).
//
// Row labels are plain <span>s inside IonItem, not IonLabel — reproduced RESUME.md's documented
// IonLabel-children jsdom gotcha directly while testing this screen (see AGENT_LOG.md's Phase 8
// entry); UserRow.tsx made the same choice for the same reason.

import {
  IonPage,
  IonHeader,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonNote,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { AccountIndicator } from '../../components/AccountIndicator.js';
import { useResource } from '../../data/useResource.js';
import { fetchUserSettings } from '../../data/settings.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { GeneralSection } from './sections/GeneralSection.js';
import { JournalSection } from './sections/JournalSection.js';
import { ProfileSection } from './sections/ProfileSection.js';
import { NotificationsSection } from './sections/NotificationsSection.js';
import { RemindersSection } from './sections/RemindersSection.js';
import { MiscSection } from './sections/MiscSection.js';
import { BrowsingSection } from './sections/BrowsingSection.js';

export type SettingsSection =
  'general' | 'journal' | 'profile' | 'notifications' | 'reminders' | 'misc' | 'browsing';

const SECTION_TITLES: Record<SettingsSection, string> = {
  general: 'General',
  journal: 'Journal',
  profile: 'Profile',
  notifications: 'Notifications',
  reminders: 'Reminders',
  misc: 'Misc',
  browsing: 'Browsing',
};

interface SettingsScreenProps {
  section?: string;
}

function isSettingsSection(value: string): value is SettingsSection {
  return value in SECTION_TITLES;
}

export function SettingsScreen({ section }: SettingsScreenProps) {
  if (section && isSettingsSection(section)) {
    return <SectionScreen section={section} />;
  }
  return <SettingsHub />;
}

function SectionScreen({ section }: { section: SettingsSection }) {
  return (
    <IonPage>
      <IonHeader>
        <AppHeader title={SECTION_TITLES[section]} variant="back" backHref="/settings" />
      </IonHeader>
      <IonContent>
        {section === 'general' && <GeneralSection />}
        {section === 'journal' && <JournalSection />}
        {section === 'profile' && <ProfileSection />}
        {section === 'notifications' && <NotificationsSection />}
        {section === 'reminders' && <RemindersSection />}
        {section === 'misc' && <MiscSection />}
        {section === 'browsing' && <BrowsingSection />}
      </IonContent>
    </IonPage>
  );
}

function SettingsHub() {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  const canWrite = activeAccount?.appTokenScope === 'read,write';
  const { state } = useResource(() => fetchUserSettings(), [activeAccount?.id]);

  const privacyProtected = state.status === 'loaded' ? state.data.privacy === 1 : null;

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Settings" end={<AccountIndicator />} />
      </IonHeader>
      <IonContent>
        {/* Blipfoto account settings: server-backed (user/settings), follows whichever account
            is active — switching accounts shows that account's own values. Notifications lives
            here rather than in App settings below because a user thinks of it as "what am I
            notified about from my Blipfoto account", even though its Advanced polling interval
            happens to be stored locally (data/settings.ts's own header comment). */}
        <IonList>
          <IonListHeader>
            <IonNote>Blipfoto Account Settings</IonNote>
          </IonListHeader>
          <IonItem button onClick={() => navigate.push('/settings/general')}>
            <span>General</span>
          </IonItem>
          <IonItem button onClick={() => navigate.push('/settings/journal')}>
            <span>Journal</span>
          </IonItem>
          <IonItem button onClick={() => navigate.push('/settings/profile')}>
            <span>Profile</span>
          </IonItem>
          <IonItem button onClick={() => navigate.push('/settings/notifications')}>
            <span>Notifications</span>
          </IonItem>
          {privacyProtected && (
            <IonItem button onClick={() => navigate.push('/me/refused')}>
              <span>Refused followers</span>
              <IonNote slot="end">People who can&rsquo;t see your journal</IonNote>
            </IonItem>
          )}
        </IonList>

        {/* App settings: device-local, never round-trip to Blipfoto's server — how b-mobile
            itself behaves on this phone, not the account. Accounts also has its own top-level
            nav-menu entry (it must stay reachable pre-sign-in, before Settings itself is
            reachable at all) — the row here is just a discoverable shortcut alongside its
            siblings, not the only path to it. */}
        <IonList>
          <IonListHeader>
            <IonNote>App Settings</IonNote>
          </IonListHeader>
          <IonItem button onClick={() => navigate.push('/accounts')}>
            <span>Accounts</span>
            <IonNote slot="end">{activeAccount?.username}</IonNote>
          </IonItem>
          {canWrite && (
            <IonItem button onClick={() => navigate.push('/settings/reminders')}>
              <span>Reminders</span>
            </IonItem>
          )}
          <IonItem button onClick={() => navigate.push('/hidden')}>
            <span>Hidden members</span>
          </IonItem>
          <IonItem button onClick={() => navigate.push('/settings/browsing')}>
            <span>Browsing</span>
          </IonItem>
          <IonItem button onClick={() => navigate.push('/settings/misc')}>
            <span>Misc</span>
          </IonItem>
        </IonList>

        {state.status === 'loading' && (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {state.status === 'error' && (
          <div className="ion-padding">
            <IonText color="medium">
              <p>Could not load your privacy setting — Refused followers may be hidden for now.</p>
            </IonText>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
}
