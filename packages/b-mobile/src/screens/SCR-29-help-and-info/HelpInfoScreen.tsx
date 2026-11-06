// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-29 — Help & About. Not account-gated (AppShell.tsx's nav item is shown unconditionally,
// unlike Settings) — this is "the only settings-bearing screen a logged-out user can reach," and
// every action on it (including the privacy policy) must work with no account signed in. Nothing here reads or writes an account, so unlike
// SCR-25 there's no server fetch anywhere on this screen at all.
//
// The link-handling toggle now lives in Settings → Appearance, and Delete my account on the Accounts
// page (b-oss#305, #306); neither is here any more.
//
// Same "one component, sub-sections via an optional route param" shape as SCR-25's SettingsScreen
// — Icon guide/Safety & privacy/Open-source licences are in-app static pushes, not separate
// SCR-numbered screens.
//
// External link URLs confirmed by the user 2026-08-04 (were previously the bare root domain,
// since the spec never states them).
// "Terms & legal"'s original wireframe row is one row with
// one destination — the acceptable-use policy the user also supplied isn't a second link on this
// row, it's added to the in-app Safety & privacy section below instead, alongside "Be Excellent
// to Each Other" (also user-supplied, not in the original spec): both are about community conduct,
// which is exactly what that section already covers, and neither forces the wireframe's single
// external-link-per-row shape to change.
//
// Row labels are plain <span>s inside IonItem, not IonLabel — the jsdom gotcha in app-architecture.md
// (IonLabel not reliably rendering its children in this jsdom test setup) reproduced on this
// screen's own hub; UserRow.tsx made the same choice for the same reason.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  checkShellBuild,
  knownShellBuild,
  type ShellBuildCheck,
} from '../../platform/shellBuild.js';
import { IonPage, IonHeader, IonContent, IonList, IonItem, IonNote, IonButton } from '@ionic/react';
import { NavRow, SectionHeader } from '../../components/SettingsForm.js';
import { AppHeader } from '../../components/AppHeader.js';
import { CachedImage } from '../../components/CachedImage.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { openUrl } from '../../platform/browser.js';
import { BLIPFOTO_STATUS_URL } from '../../statusLink.js';

const HELP_URL = 'https://www.blipfoto.com/help';
const TERMS_URL = 'https://www.blipfoto.com/legal/terms';
const ACCEPTABLE_USE_URL = 'https://www.blipfoto.com/legal/acceptable-use';
const PRIVACY_URL = 'https://www.blipfoto.com/legal/privacy';
const BE_EXCELLENT_URL = 'https://www.blipfoto.com/be-excellent';
const SOURCE_URL = 'https://b-oss.dev/';
// This app's own policy (what b-mobile and its push service handle), as given in the Play listing.
const APP_PRIVACY_URL = 'https://b-oss.dev/b-mobile-privacy.html';

export type HelpInfoSection = 'icon-guide' | 'keyboard' | 'safety-privacy' | 'licences';

const SECTION_TITLES: Record<HelpInfoSection, string> = {
  'icon-guide': 'Icon guide',
  keyboard: 'Keyboard guide',
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
      <IonContent className="ion-padding form-column">
        {section === 'icon-guide' && <IconGuide />}
        {section === 'keyboard' && <KeyboardGuide />}
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

const KEYBOARD_KEYS: Array<[string, string]> = [
  ['Tab / Shift+Tab', 'Move between buttons, links and photos'],
  ['Enter / Space', 'Open the highlighted item'],
  ['Up / Down', 'Scroll the page'],
  ['Page Up / Page Down', 'Scroll by a page at a time'],
  ['Home / End', 'Jump to the top / bottom of the page'],
  ['Left / Right', 'Previous / next: grid pages and journal entries'],
  ['Ctrl+Left / Ctrl+Right', 'On an entry opened from a list: next / previous in that list'],
  ['Backspace', 'Go back, when a back arrow is showing'],
  ['Ctrl + / Ctrl −', 'Zoom the photo grid or a full-screen photo in / out'],
  ['Ctrl+0', 'Reset the zoom'],
];

const EDITOR_KEYS: Array<[string, string]> = [
  ['Ctrl+B', 'Bold'],
  ['Ctrl+I', 'Italic'],
  ['Ctrl+U', 'Underline'],
  ['Ctrl+S', 'Strikethrough'],
  ['Ctrl+L', 'Link'],
];

function KeyRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <>
      {rows.map(([keys, what]) => (
        <div key={keys} style={{ display: 'flex', gap: 12, padding: '6px 0' }}>
          <kbd style={{ flex: '0 0 45%', fontFamily: 'inherit', fontWeight: 600 }}>{keys}</kbd>
          <span>{what}</span>
        </div>
      ))}
    </>
  );
}

function KeyboardGuide() {
  return (
    <>
      <p>With a physical keyboard:</p>
      <KeyRows rows={KEYBOARD_KEYS} />
      <p>
        <strong>When writing (entry description, comments)</strong>
      </p>
      <KeyRows rows={EDITOR_KEYS} />
    </>
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

const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
const GEOAPIFY_URL = 'https://www.geoapify.com/';
const OPENMAPTILES_URL = 'https://openmaptiles.org/';
const MAPTILER_URL = 'https://www.maptiler.com/copyright/';
const GPL_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';

/** licences.generated.json's shape (scripts/licences.mjs). `texts` holds each distinct licence
 * text once; a package's `texts` are indexes into it. */
interface LicencesFile {
  packages: Array<{
    name: string;
    version: string;
    license: string;
    repository: string | null;
    texts: number[];
  }>;
  texts: string[];
}

/** native-licences.generated.json's shape (scripts/native-licences.mjs): Android (Gradle)
 * libraries, each pointing at the licences that apply to it. `text` is null where only the
 * licence's name and URL are known. */
interface NativeLicencesFile {
  licences: Array<{ id: string; name: string; url: string | null; text: string | null }>;
  artifacts: Array<{
    name: string;
    version: string;
    licences: number[];
    notices?: Array<{ path: string; text: string }>;
  }>;
}

function InlineLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button
      onClick={() => void openUrl(url)}
      style={{ color: 'var(--accent-alt)', textDecoration: 'underline', font: 'inherit' }}
    >
      {children}
    </button>
  );
}

function LicenceEntry({ pkg, texts }: { pkg: LicencesFile['packages'][number]; texts: string[] }) {
  // Texts are only rendered once opened: there are about a hundred packages.
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} style={{ padding: '4px 0' }}>
      <summary>
        {pkg.name} {pkg.version} — {pkg.license}
      </summary>
      {open &&
        pkg.texts.map((i) => (
          <pre
            key={i}
            style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', overflowWrap: 'anywhere' }}
          >
            {texts[i]}
          </pre>
        ))}
    </details>
  );
}

function NativeLicenceGroup({
  licence,
  artifacts,
}: {
  licence: NativeLicencesFile['licences'][number];
  artifacts: NativeLicencesFile['artifacts'];
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} style={{ padding: '4px 0' }}>
      <summary>
        {licence.name} — {artifacts.length} {artifacts.length === 1 ? 'library' : 'libraries'}
      </summary>
      {open && (
        <>
          {licence.url && (
            <p>
              <InlineLink url={licence.url}>Read the licence online</InlineLink>
            </p>
          )}
          {licence.text && (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', overflowWrap: 'anywhere' }}>
              {licence.text}
            </pre>
          )}
          <ul style={{ fontSize: '0.75rem', overflowWrap: 'anywhere' }}>
            {artifacts.map((a) => (
              <li key={`${a.name}@${a.version}`}>
                {a.name} {a.version}
                {a.notices?.map((n) => (
                  <details key={n.path}>
                    <summary>Notice</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.text}</pre>
                  </details>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}

function Licences() {
  // Generated at build time from the production dependency tree (scripts/licences.mjs), and
  // loaded only when this page opens so its ~120 KB of text stays out of the main bundle.
  const [data, setData] = useState<LicencesFile | null>(null);
  const [native, setNative] = useState<NativeLicencesFile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([import('./licences.generated.json'), import('./native-licences.generated.json')])
      .then(([npm, nat]) => {
        if (cancelled) return;
        setData(npm.default);
        setNative(nat.default);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <p>
        b-mobile is free software, licensed under the{' '}
        <InlineLink url={GPL_URL}>GNU General Public License, version 3 or later</InlineLink>{' '}
        (GPL-3.0-or-later). Visit the <InlineLink url={SOURCE_URL}>b-oss website</InlineLink> for
        the source code.
      </p>

      <p>
        <strong>Maps</strong>
      </p>
      <p>
        Maps powered by <InlineLink url={GEOAPIFY_URL}>Geoapify</InlineLink>. Map style &copy;{' '}
        <InlineLink url={OPENMAPTILES_URL}>OpenMapTiles</InlineLink>. Map data &copy;{' '}
        <InlineLink url={OSM_COPYRIGHT_URL}>OpenStreetMap contributors</InlineLink>, available under
        the Open Database License (ODbL). Satellite imagery &copy;{' '}
        <InlineLink url={MAPTILER_URL}>MapTiler</InlineLink>.
      </p>

      <p>
        <strong>Open-source libraries</strong>
      </p>
      <p>This app includes the following libraries. Tap one to read its licence.</p>
      {failed && <p>The licence list couldn&rsquo;t be loaded.</p>}
      {!data && !failed && <p>Loading…</p>}
      {data?.packages.map((pkg) => (
        <LicenceEntry key={`${pkg.name}@${pkg.version}`} pkg={pkg} texts={data.texts} />
      ))}

      {native && (
        <>
          <p>
            <strong>Android libraries</strong>
          </p>
          <p>
            The Android app also includes the following libraries ({native.artifacts.length}),
            grouped by licence. Tap a licence to see the libraries it covers.
          </p>
          {native.licences.map((licence, i) => (
            <NativeLicenceGroup
              key={licence.id}
              licence={licence}
              artifacts={native.artifacts.filter((a) => a.licences.includes(i))}
            />
          ))}
        </>
      )}
    </>
  );
}

function HelpInfoHub() {
  const navigate = useAppNavigate();
  // Desktop only (b-oss#696): the shell's own build, shown beside the web build. Null elsewhere.
  const [shellBuild, setShellBuild] = useState<ShellBuildCheck | null>(knownShellBuild());
  useEffect(() => {
    void checkShellBuild().then(setShellBuild);
  }, []);

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title="Help & about"
          variant="back"
          backHref="/browse"
          // Help is a visit, not a destination (b-oss#744): always ←, never ☰.
          accountIndicator={false}
        />
      </IonHeader>
      <IonContent className="form-column">
        <IonList>
          <SectionHeader>Help</SectionHeader>
          <NavRow label="Help" kind="external" onClick={() => void openUrl(HELP_URL)} />
          <NavRow
            label="Blipfoto status (unofficial)"
            kind="external"
            onClick={() => void openUrl(BLIPFOTO_STATUS_URL)}
          />
          <NavRow
            label="Icon guide"
            kind="push"
            onClick={() => navigate.push('/help/icon-guide')}
          />
          <NavRow
            label="Keyboard guide"
            kind="push"
            onClick={() => navigate.push('/help/keyboard')}
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
          {shellBuild && (
            <IonItem lines="full">
              <span>Desktop program version</span>
              <IonNote slot="end">
                {shellBuild.shell}
                {shellBuild.kind === 'mismatch' ? ' (differs)' : ''}
              </IonNote>
            </IonItem>
          )}
          <NavRow
            label="b-mobile privacy policy"
            kind="external"
            onClick={() => void openUrl(APP_PRIVACY_URL)}
          />
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
