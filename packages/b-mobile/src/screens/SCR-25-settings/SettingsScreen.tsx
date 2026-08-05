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
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonNote,
  IonSpinner,
  IonText,
} from '@ionic/react';
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

export type SettingsSection =
  'general' | 'journal' | 'profile' | 'notifications' | 'reminders' | 'misc';

const SECTION_TITLES: Record<SettingsSection, string> = {
  general: 'General',
  journal: 'Journal',
  profile: 'Profile',
  notifications: 'Notifications',
  reminders: 'Reminders',
  misc: 'Misc',
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
  const navigate = useAppNavigate();
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => navigate.goBack()}>Back</IonButton>
          </IonButtons>
          <IonTitle>{SECTION_TITLES[section]}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {section === 'general' && <GeneralSection />}
        {section === 'journal' && <JournalSection />}
        {section === 'profile' && <ProfileSection />}
        {section === 'notifications' && <NotificationsSection />}
        {section === 'reminders' && <RemindersSection />}
        {section === 'misc' && <MiscSection />}
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
        <IonToolbar>
          <IonTitle>Settings</IonTitle>
          <IonButtons slot="end">
            <AccountIndicator />
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonItem button onClick={() => navigate.push('/accounts')}>
            <span>Accounts</span>
            <IonNote slot="end">{activeAccount?.username}</IonNote>
          </IonItem>
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
          {canWrite && (
            <IonItem button onClick={() => navigate.push('/settings/reminders')}>
              <span>Reminders</span>
            </IonItem>
          )}
          <IonItem button onClick={() => navigate.push('/settings/misc')}>
            <span>Misc</span>
          </IonItem>
          <IonItem button onClick={() => navigate.push('/hidden')}>
            <span>Hidden members</span>
            <IonNote slot="end">People whose content you won&rsquo;t see</IonNote>
          </IonItem>
          {privacyProtected && (
            <IonItem button onClick={() => navigate.push('/me/refused')}>
              <span>Refused followers</span>
              <IonNote slot="end">People who can&rsquo;t see your journal</IonNote>
            </IonItem>
          )}
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
