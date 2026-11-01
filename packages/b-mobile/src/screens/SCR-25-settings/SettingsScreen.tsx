// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 — Settings (FLW-17). One component, not eight separate SCR-numbered screens (the spec's
// own "every setting lives on this one screen rather than in separate sub-screens") — the hub
// lists rows, each pushing to `/settings/:section` (AppRoutes.tsx), which mounts this same
// component with `section` set; each section is its own file under `sections/` for size, not a
// new screen identity. Reached only via AppShell's nav item, which is itself only rendered when
// an account is active — no separate guard needed here, matching
// every other account-scoped screen in this app (e.g. SCR-20/21's own lack of one).
//
// The hub fetches `user/settings` once, for itself: the Refused followers row's visibility
// ("only for a protected journal") needs to know the *current* privacy value, and "no caching for
// display" (BEHAVIOUR.md) means this has to be a fresh fetch on every visit to the hub, not a value
// remembered from whichever section screen last saved it — a direct instance of "screens refetch,
// never depend on a prior screen's data" (see useAppNavigate.ts's own doc comment).
//
// Row labels are plain <span>s inside IonItem, not IonLabel — for the jsdom IonLabel-children
// gotcha (see app-architecture.md's "Gotchas" section); UserRow.tsx made the same choice for the same reason.

import {
  IonPage,
  IonHeader,
  IonContent,
  IonList,
  IonItem,
  IonNote,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { CaptionRow, SectionHeader } from '../../components/SettingsForm.js';
import { AppHeader } from '../../components/AppHeader.js';
import { useResource } from '../../data/useResource.js';
import { fetchUserSettings } from '../../data/settings.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { DetailsSection } from './sections/DetailsSection.js';
import { ProfileSection } from './sections/ProfileSection.js';
import { NotificationsSection } from './sections/NotificationsSection.js';
import { RemindersSection } from './sections/RemindersSection.js';
import { AppearanceSection } from './sections/AppearanceSection.js';

export type SettingsSection = 'details' | 'profile' | 'notifications' | 'appearance' | 'reminders';

const SECTION_TITLES: Record<SettingsSection, string> = {
  details: 'Details & journal',
  profile: 'Profile',
  notifications: 'Notification settings',
  appearance: 'Appearance',
  reminders: 'Reminders',
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
        <AppHeader
          title={SECTION_TITLES[section]}
          variant="back"
          backHref="/settings"
          // Per-account sections (and Reminders, which are per account) show the indicator;
          // Appearance is device-wide, so it doesn't.
          accountIndicator={section !== 'appearance'}
        />
      </IonHeader>
      <IonContent>
        {section === 'details' && <DetailsSection />}
        {section === 'profile' && <ProfileSection />}
        {section === 'notifications' && <NotificationsSection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'reminders' && <RemindersSection />}
      </IonContent>
    </IonPage>
  );
}

function SettingsHub() {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  // Signed out there is no account to ask: skip the fetch (null result) and show the account-scoped
  // rows greyed out instead.
  const signedIn = activeAccount !== null;
  const { state } = useResource(
    () => (signedIn ? fetchUserSettings() : Promise.resolve(null)),
    [activeAccount?.id],
  );

  const privacyProtected =
    state.status === 'loaded' && state.data ? state.data.privacy === 1 : null;

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Settings" />
      </IonHeader>
      <IonContent>
        {/* App settings: device-local, never round-trip to Blipfoto's server — how b-mobile
            itself behaves on this phone, not the account. Accounts and Hidden members have no
            menu entry any more (b-oss#733); this is where they live. */}
        <IonList>
          <SectionHeader>App settings</SectionHeader>
          <IonItem button detail onClick={() => navigate.push('/settings/appearance')}>
            <span>Appearance</span>
          </IonItem>
          <IonItem button detail onClick={() => navigate.push('/settings/reminders')}>
            <span>Reminders</span>
          </IonItem>
          <IonItem button detail onClick={() => navigate.push('/accounts')}>
            <span>Accounts</span>
            {activeAccount && <IonNote slot="end">{activeAccount.username}</IonNote>}
          </IonItem>
          <IonItem button detail onClick={() => navigate.push('/hidden')}>
            <span>Hidden members</span>
          </IonItem>
        </IonList>

        {/* Blipfoto account settings: server-backed (user/settings), follows whichever account
            is active — switching accounts shows that account's own values. Notification settings
            lives here rather than in App settings because a user thinks of it as "what am I
            notified about from my Blipfoto account", even though its Advanced polling interval
            happens to be stored locally (data/settings.ts's own header comment). */}
        <IonList>
          <SectionHeader>Blipfoto account settings</SectionHeader>
          {!signedIn && <CaptionRow>Sign in to change these.</CaptionRow>}
          <IonItem
            button
            detail
            disabled={!signedIn}
            onClick={() => navigate.push('/settings/details')}
          >
            <span>Details &amp; journal</span>
          </IonItem>
          <IonItem
            button
            detail
            disabled={!signedIn}
            onClick={() => navigate.push('/settings/profile')}
          >
            <span>Profile</span>
          </IonItem>
          <IonItem
            button
            detail
            disabled={!signedIn}
            onClick={() => navigate.push('/settings/notifications')}
          >
            <span>Notification settings</span>
          </IonItem>
          {privacyProtected && (
            <IonItem button detail onClick={() => navigate.push('/me/refused')}>
              <span>Refused followers</span>
              <IonNote slot="end">People who can&rsquo;t see your journal</IonNote>
            </IonItem>
          )}
        </IonList>

        {signedIn && state.status === 'loading' && (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {signedIn && state.status === 'error' && (
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
