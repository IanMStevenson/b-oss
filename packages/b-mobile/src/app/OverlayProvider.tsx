// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Owns every overlay (upgrade prompt, first-run explainer, account switcher) as overlays opened
// imperatively, kept out of the router (§5) — dismissing a dialog is not a navigation, and
// rules.md is explicit the account switcher "is not a new screen ID". `<OverlayHost />` is the
// one render site (mounted once from `AppShell.tsx`, inside the router since the upgrade prompt
// and the account switcher both navigate) — callers only ever import `useOverlay()`, never render
// their own copy of these overlays.
//
// Deliberately does NOT own per-screen destructive confirmations ("Remove account?", "Discard
// comment?", "Delete entry?") — each names a different action with different consequences, so
// there's no real duplication to remove, unlike the upgrade prompt (five screens had a
// byte-identical `<IonAlert>` before this). Retrofitting genuinely distinct dialogs into one
// shared "confirmation" kind would be a second, competing pattern for no benefit — local
// `useState` stays right for those.

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { IonAlert, IonButton } from '@ionic/react';
import { useAppNavigate } from './routes/useAppNavigate.js';
import { AccountSwitcherOverlay } from './AccountSwitcherOverlay.js';

export type OverlayState =
  | { kind: null }
  | { kind: 'upgrade-prompt' }
  | { kind: 'first-run-explainer' }
  | { kind: 'account-switcher' };

interface OverlayContextValue {
  overlay: OverlayState;
  /** rules.md: reached whenever a read-only account hits a write affordance it can't use. */
  showUpgradePrompt: () => void;
  /** SCR-01's one-time explainer, shown above the mode choice on first deliberate visit. */
  showFirstRunExplainer: () => void;
  /** rules.md, "Multi-account clarity" — tapping the persistent account indicator. */
  showAccountSwitcher: () => void;
  dismiss: () => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<OverlayState>({ kind: null });
  const value: OverlayContextValue = {
    overlay,
    showUpgradePrompt: () => setOverlay({ kind: 'upgrade-prompt' }),
    showFirstRunExplainer: () => setOverlay({ kind: 'first-run-explainer' }),
    showAccountSwitcher: () => setOverlay({ kind: 'account-switcher' }),
    dismiss: () => setOverlay({ kind: null }),
  };
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlay must be used within OverlayProvider');
  return ctx;
}

// TextStrings.csv's SCR-01.explainer.first_run.* rows ("Short panel/sheet; single 'Got it'
// dismissal"). A plain fixed-position overlay `<div>`, not IonModal — IonModal's `present()`
// throws "framework delegate is missing" in this jsdom test setup (no established precedent for
// IonModal anywhere else in this codebase to follow instead), the same class of Ionic-component-
// vs-jsdom friction RESUME.md already documents for IonLabel. A styled div is simpler, has no
// such dependency, and satisfies "short panel/sheet" just as well as a real IonModal would.
// TODO(Phase 12.5): copy hardcoded here rather than read from the typed copy deck Phase 12.5
// builds at src/strings/ — that phase should repoint this, not re-invent the wording.
function FirstRunExplainer({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Two ways to sign in"
      style={{
        position: 'fixed',
        inset: 'auto 0 0 0',
        zIndex: 1000,
        background: 'var(--bg, #fff)',
        borderTop: '1px solid var(--line, #e5e7eb)',
        borderRadius: '16px 16px 0 0',
        padding: 16,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
      }}
    >
      <h2>Two ways to sign in</h2>
      <p>
        Read-write lets you do everything: post your daily photo, star, favourite, comment and
        follow. Most people want this.
      </p>
      <p>
        Read-only signs you in to browse and read, and nothing else. Nothing you do can change your
        account. Useful if you mostly look rather than post, or you&rsquo;d rather this app
        couldn&rsquo;t post as you.
      </p>
      <p>You can change this later for any account, and you can add more than one account.</p>
      <IonButton expand="block" onClick={onDismiss}>
        Got it
      </IonButton>
    </div>
  );
}

/** The one place any of these overlays actually renders — mounted once from `AppShell.tsx`,
 * inside the router (needs `useAppNavigate()` for the upgrade prompt's "Manage accounts"). */
export function OverlayHost() {
  const { overlay, dismiss } = useOverlay();
  const navigate = useAppNavigate();

  return (
    <>
      <IonAlert
        isOpen={overlay.kind === 'upgrade-prompt'}
        header="Read-only account"
        message="This account is signed in read-only. Sign in for write access to continue."
        onDidDismiss={dismiss}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Manage accounts', handler: () => navigate.push('/accounts') },
        ]}
      />
      {overlay.kind === 'first-run-explainer' && <FirstRunExplainer onDismiss={dismiss} />}
      {overlay.kind === 'account-switcher' && <AccountSwitcherOverlay onDismiss={dismiss} />}
    </>
  );
}
