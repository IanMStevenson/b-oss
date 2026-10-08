// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-29 — Help & About. Not account-gated (AppShell.tsx's nav item is shown unconditionally,
// unlike Settings) — this is "the only settings-bearing screen a logged-out user can reach," and
// every action on it (including the privacy policy) must work with no account signed in. Nothing here reads or writes an account, so unlike
// SCR-25 there's no server fetch anywhere on this screen at all.
//
// The link-handling toggle now lives in Settings → General, and Delete my account on the Accounts
// page (b-oss#305, #306); neither is here any more.
//
// Same "one component, sub-sections via an optional route param" shape as SCR-25's SettingsScreen
// — Icon guide/Safety & privacy/Open-source licences are in-app static pushes, not separate
// SCR-numbered screens.
//
// External link URLs confirmed by the user 2026-08-04 (were previously the bare root domain,
// since the spec never states them).
// "Terms & legal"'s wireframe row (docs/AppSpec/screens/SCR-29-help-and-info.md) is one row with
// one destination — the acceptable-use policy the user also supplied isn't a second link on this
// row, it's added to the in-app Safety & privacy section below instead, alongside "Be Excellent
// to Each Other" (also user-supplied, not in the original spec): both are about community conduct,
// which is exactly what that section already covers, and neither forces the wireframe's single
// external-link-per-row shape to change.
//
// Row labels are plain <span>s inside IonItem, not IonLabel — the jsdom gotcha in app-architecture.md
// (IonLabel not reliably rendering its children in this jsdom test setup) reproduced on this
// screen's own hub; UserRow.tsx made the same choice for the same reason.

import { IonPage, IonHeader, IonContent, IonList, IonItem, IonNote, IonButton } from '@ionic/react';
import { NavRow, SectionHeader } from '../../components/SettingsForm.js';
import { AppHeader } from '../../components/AppHeader.js';
import { CachedImage } from '../../components/CachedImage.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { openUrl } from '../../platform/browser.js';

const HELP_URL = 'https://www.blipfoto.com/help';
const TERMS_URL = 'https://www.blipfoto.com/legal/terms';
const ACCEPTABLE_USE_URL = 'https://www.blipfoto.com/legal/acceptable-use';
const PRIVACY_URL = 'https://www.blipfoto.com/legal/privacy';
const BE_EXCELLENT_URL = 'https://www.blipfoto.com/be-excellent';
const SOURCE_URL = 'https://ianmstevenson.github.io/b-oss/';

export type HelpInfoSection = 'icon-guide' | 'safety-privacy' | 'licences';

const SECTION_TITLES: Record<HelpInfoSection, string> = {
  'icon-guide': 'Icon guide',
  'safety-privacy': 'Safety & privacy',
  licences: 'Open source licences',
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
  return (
    <IonPage>
      <IonHeader>
        <AppHeader title={SECTION_TITLES[section]} variant="back" backHref="/help" />
      </IonHeader>
      <IonContent className="ion-padding">
        {section === 'icon-guide' && <IconGuide />}
        {section === 'safety-privacy' && <SafetyPrivacy />}
        {section === 'licences' && <Licences />}
      </IonContent>
    </IonPage>
  );
}

// Content drawn from Blipfoto's own icon guide (blipfoto.com/help/icons), narrowed to exactly
// the icon_ids the API ever actually returns (confirmed 2026-08-11) — the Blipfuture pledge
// badges shown on the website are never sent to us, so they're dropped here entirely rather than
// documenting a badge a user could never actually see in this app. Real icon images, not text —
// the same badges rendered next to a username elsewhere (comments, profiles, etc., via
// UserBadges.tsx) are exactly these, fetched from the same static path the API's own icon_url
// values point at.
const ICON_BASE = 'https://www.blipfoto.com/_assets/images/icons/';

const ENTRY_LEVEL_ICONS: Array<{ id: string; label: string }> = [
  { id: '0', label: 'Fewer than 10 — a new member' },
  { id: '10', label: '10–99 — a few weeks of entries' },
  { id: '100', label: '100–364 — several months of entries' },
  { id: '365', label: '365–999 — more than a year of entries!' },
  { id: '1000', label: '1000–1499 — several years' },
  { id: '1500', label: '1500–1999 — over 4 years' },
  { id: '2000', label: '2000–2999 — up to 8 years' },
  { id: '3000', label: '3000–3649 — nearly a decade…' },
  { id: '3650', label: '3650–4999 — 10 years or more!' },
  { id: '5000', label: '5000+ — wow, keep going!' },
];

const OTHER_ICONS: Array<{ id: string; label: string }> = [
  { id: '10000', label: 'Reached a new milestone today' },
  { id: '20000', label: 'Full Member' },
  { id: '30000', label: 'Director' },
];

function IconRow({ id, label }: { id: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <CachedImage
        src={`${ICON_BASE}${id}.png`}
        alt=""
        style={{ width: 32, height: 32, flexShrink: 0 }}
      />
      <span>{label}</span>
    </div>
  );
}

function IconGuide() {
  return (
    <>
      <p>Badges next to a member&rsquo;s name show how long they&rsquo;ve been journaling:</p>

      <p>
        <strong>Entries</strong>
      </p>
      {ENTRY_LEVEL_ICONS.map((icon) => (
        <IconRow key={icon.id} {...icon} />
      ))}

      <p>
        <strong>Other</strong>
      </p>
      {OTHER_ICONS.map((icon) => (
        <IconRow key={icon.id} {...icon} />
      ))}
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
      <IonButton expand="block" fill="outline" onClick={() => void openUrl(ACCEPTABLE_USE_URL)}>
        Blipfoto&rsquo;s acceptable use policy
      </IonButton>
      <IonButton expand="block" fill="outline" onClick={() => void openUrl(BE_EXCELLENT_URL)}>
        Be excellent to each other
      </IonButton>
    </>
  );
}

// Runtime dependencies shipped in the app, derived by hand from packages/b-mobile/package.json
// plus the runtime dependencies of the workspace packages it bundles (b-view's ProseMirror
// editor packages, b-api, b-visual). Re-check when a runtime dependency is added.
const THIRD_PARTY_LIBRARIES = [
  '@ionic/react and @ionic/react-router',
  '@capacitor/core and its plugins',
  '@aparajita/capacitor-secure-storage',
  'react and react-dom',
  'react-router and react-router-dom',
  'zustand',
  'react-easy-crop',
  'react-zoom-pan-pinch',
  'maplibre-gl',
  'lucide-react',
  '@bbob/react and its plugins',
  'ProseMirror (prosemirror-model, -state, -view, -commands, -history, -keymap)',
];

function Licences() {
  return (
    <>
      <p>
        Visit the{' '}
        <button
          onClick={() => void openUrl(SOURCE_URL)}
          style={{ color: 'var(--green-700)', textDecoration: 'underline', font: 'inherit' }}
        >
          b-oss website
        </button>{' '}
        to find links to the source code and full licence and dependency information.
      </p>
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
  // __APP_VERSION__ (root CLAUDE.md's Versioning section, env.d.ts's ambient declaration).
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Help & about" accountIndicator={false} />
      </IonHeader>
      <IonContent>
        <IonList>
          <SectionHeader>Help</SectionHeader>
          <NavRow label="Help" kind="external" onClick={() => void openUrl(HELP_URL)} />
          <NavRow
            label="Icon guide"
            kind="push"
            onClick={() => navigate.push('/help/icon-guide')}
          />
          <NavRow
            label="Safety & privacy"
            kind="push"
            onClick={() => navigate.push('/help/safety-privacy')}
          />
          <NavRow
            label="Blipfoto terms & legal"
            kind="external"
            onClick={() => void openUrl(TERMS_URL)}
          />
          <NavRow
            label="Blipfoto privacy policy"
            kind="external"
            onClick={() => void openUrl(PRIVACY_URL)}
          />

          <SectionHeader>About</SectionHeader>
          <IonItem lines="full">
            <span>App version</span>
            <IonNote slot="end">{version}</IonNote>
          </IonItem>
          <NavRow
            label="Open source licences"
            kind="push"
            onClick={() => navigate.push('/help/licences')}
          />
        </IonList>
      </IonContent>
    </IonPage>
  );
}
