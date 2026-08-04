// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-29 — Help & Info. Not account-gated (AppShell.tsx's nav item is shown unconditionally,
// unlike Settings) — this is "the only settings-bearing screen a logged-out user can reach," and
// every action on it (including the link-handling toggle, privacy policy, and account-deletion
// link) must work with no account signed in. Nothing here reads or writes an account, so unlike
// SCR-25 there's no server fetch anywhere on this screen at all.
//
// Same "one component, sub-sections via an optional route param" shape as SCR-25's SettingsScreen
// — Icon guide/Safety & privacy/Open-source licences are in-app static pushes, not separate
// SCR-numbered screens.
//
// External links (Help, Terms, Privacy policy, Delete my account) all point at the bare
// blipfoto.com root, same documented gap SCR-01's own "Create account" link has — the exact
// registration/terms/help/privacy/delete-account URLs aren't stated anywhere in AppSpec/
// ImplementationSpec (see AGENT_LOG.md's Phase 2 entry and RESUME.md's gotchas). Never invented
// here; a real navigation-team pass fills these in later.
//
// Row labels are plain <span>s inside IonItem, not IonLabel — RESUME.md's documented gotcha
// (IonLabel not reliably rendering its children in this jsdom test setup) reproduced on this
// screen's own hub; UserRow.tsx made the same choice for the same reason.

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
  IonCheckbox,
} from '@ionic/react';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';
import { openUrl } from '../../platform/browser.js';

const BLIPFOTO_ROOT = 'https://www.blipfoto.com';

export type HelpInfoSection = 'icon-guide' | 'safety-privacy' | 'licences';

const SECTION_TITLES: Record<HelpInfoSection, string> = {
  'icon-guide': 'Icon guide',
  'safety-privacy': 'Safety & privacy',
  licences: 'Open-source licences',
};

interface HelpInfoScreenProps {
  section?: string;
}

function isHelpInfoSection(value: string): value is HelpInfoSection {
  return value in SECTION_TITLES;
}

export function HelpInfoScreen({ section }: HelpInfoScreenProps) {
  if (section && isHelpInfoSection(section)) {
    return <SectionScreen section={section} />;
  }
  return <HelpInfoHub />;
}

function SectionScreen({ section }: { section: HelpInfoSection }) {
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
      <IonContent className="ion-padding">
        {section === 'icon-guide' && <IconGuide />}
        {section === 'safety-privacy' && <SafetyPrivacy />}
        {section === 'licences' && <Licences />}
      </IonContent>
    </IonPage>
  );
}

function IconGuide() {
  return (
    <>
      <p>Badges and icons you&rsquo;ll see around the app:</p>
      <ul>
        <li>Award badges — shown on a journal&rsquo;s Awards page, one per award earned.</li>
        <li>Star / Favourite — mark an entry as starred or a favourite.</li>
        <li>Follow status — whether you follow, are followed by, or have a pending request.</li>
        <li>Protected journal — a lock indicates the journal requires a follow request.</li>
      </ul>
    </>
  );
}

function SafetyPrivacy() {
  return (
    <>
      <p>What you can do about someone else&rsquo;s behaviour:</p>
      <ul>
        <li>
          <strong>Hide a member</strong> — you stop seeing them. Personal, immediate, reversible.
        </li>
        <li>
          <strong>Remove a follower</strong> — they lose access to a private journal, but may ask
          again.
        </li>
        <li>
          <strong>Refuse a follow request</strong> — they stop seeing your journal. Requires a
          private journal, and acts on a request, not on someone already following.
        </li>
        <li>
          <strong>Delete a comment</strong> — the journal owner may remove any comment on their own
          entries.
        </li>
        <li>
          <strong>Report</strong> — escalates an entry or a comment to Blipfoto&rsquo;s moderators,
          who can act for everyone.
        </li>
      </ul>
      <p>
        To cut someone off entirely: make your journal private, remove them as a follower, refuse
        any fresh request they send, and hide them. This is a sequence, not one switch.
      </p>
    </>
  );
}

const THIRD_PARTY_LIBRARIES = [
  '@ionic/react',
  '@capacitor/core and its plugins',
  'react and react-dom',
  'react-router and react-router-dom',
  'zustand',
  'react-easy-crop',
  'maplibre-gl',
  '@bbob/react and its plugins',
];

function Licences() {
  return (
    <>
      <p>This app is built with these open-source libraries, among others:</p>
      <ul>
        {THIRD_PARTY_LIBRARIES.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p>Each project&rsquo;s own repository holds its full licence text.</p>
    </>
  );
}

function HelpInfoHub() {
  const navigate = useAppNavigate();
  const openLinksInApp = useDevicePrefsStore((s) => s.openBlipfotoLinksInApp);
  const setOpenLinksInApp = useDevicePrefsStore((s) => s.setOpenBlipfotoLinksInApp);
  // __APP_VERSION__ (root CLAUDE.md's Versioning section, env.d.ts's ambient declaration) — this
  // is the first screen in b-mobile to actually display it.
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Help &amp; info</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonItem button onClick={() => navigate.push('/help/icon-guide')}>
            <span>Icon guide</span>
          </IonItem>
          <IonItem button onClick={() => navigate.push('/help/safety-privacy')}>
            <span>Safety &amp; privacy</span>
          </IonItem>
          <IonItem button onClick={() => void openUrl(BLIPFOTO_ROOT)}>
            <span>Help</span>
          </IonItem>
          <IonItem button onClick={() => void openUrl(BLIPFOTO_ROOT)}>
            <span>Terms &amp; legal</span>
          </IonItem>
          <IonItem button onClick={() => void openUrl(BLIPFOTO_ROOT)}>
            <span>Privacy policy</span>
          </IonItem>
          <IonItem button onClick={() => void openUrl(BLIPFOTO_ROOT)}>
            <span>Delete my account</span>
            <IonNote slot="end" style={{ maxWidth: '55%', whiteSpace: 'normal' }}>
              Opens Blipfoto&rsquo;s own page — not scoped to any one account stored in this app
            </IonNote>
          </IonItem>
          <IonItem>
            <IonCheckbox
              checked={openLinksInApp}
              onIonChange={(e) => setOpenLinksInApp(e.detail.checked)}
            >
              Open blipfoto.com links in this app
            </IonCheckbox>
          </IonItem>
          <IonItem button onClick={() => navigate.push('/help/licences')}>
            <span>Open-source licences</span>
          </IonItem>
          <IonItem>
            <span style={{ color: 'var(--muted)' }}>App version {version}</span>
          </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  );
}
