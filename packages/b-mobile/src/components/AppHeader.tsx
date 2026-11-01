// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one primary toolbar every screen opens with (b-visual's style-guide.md, "Header bar" —
// b-oss's shared convention: a solid, full-width `--green-800` bar, flush against the window
// chrome, wordmark fixed at the left as an orientation anchor). Screens reachable directly from
// the nav menu get the menu button in that left slot; everything reached by drilling in gets a
// back arrow instead, in the exact same position — there is always exactly one way back to a
// screen that has the menu.
//
// Deliberately just an <IonToolbar>, not its own <IonHeader> — a screen with a second toolbar
// (tabs, segments, search) puts both inside one shared <IonHeader>, Ionic's normal multi-toolbar
// pattern, rather than stacking two independent <IonHeader> regions.

import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { IonToolbar, IonButtons, IonMenuButton, IonBackButton } from '@ionic/react';
import { AccountIndicator } from './AccountIndicator.js';
import { useHasRouter, useHeaderNav } from '../app/routes/useHeaderNav.js';

interface AppHeaderProps {
  title: string;
  /** Leave unset for a screen that is also a menu destination: the header then shows ☰ when the
   * screen was reached from the menu and ← when it was reached by tapping something inside
   * another screen (every in-app push marks itself; see useIsDrilledIn). Pass 'back' only for a
   * screen that is never in the menu, so a deep link with no history still shows ←. */
  variant?: 'menu' | 'back';
  /** Only used for variant="back" — where IonBackButton lands if there's no history to pop to
   * (a deep link opened fresh, not navigated to from within the app). Ignored if `onBack` is
   * given, since that takes over navigation entirely. */
  backHref?: string;
  /** Only used for variant="back". A form/compose-style screen that must confirm before
   * discarding unsaved changes can't use IonBackButton's default pop-navigation (there is no
   * hook to intercept it first) — providing this swaps in a handler on the same back button,
   * calling this instead of navigating. Leave unset for a screen with nothing to lose by leaving
   * immediately (the common case). */
  onBack?: () => void;
  /** Tapping "b-mobile" goes home (Browse) and clears the stack. A screen with unsaved changes
   * passes this to intercept: it receives `goHome` and decides whether to call it now or after a
   * discard confirmation. */
  onHome?: (goHome: () => void) => void;
  /** Extra content after the title (e.g. AccountIndicator) — kept optional rather than every
   * screen reimplementing the same IonButtons/slot="end" wrapper. */
  end?: ReactNode;
  /** Mount the account switcher avatar after `end`. The rule (b-oss#320): show it wherever an
   * action or the displayed content depends on which account is active — browsing/search/map,
   * entries and everything that acts on them (compose, edit, report, comment), profiles (own AND
   * others': following acts as the active account), inboxes, uploads, follower lists, and
   * Settings screens that are per account (Blipfoto account sections, App > General's
   * Reminders). Do NOT show it where nothing depends on the account: Accounts (it is the list),
   * Sign in, Help & About, and device-wide settings (Browsing, Hidden members). The default is on for
   * variant="menu" and off for back screens, so a back screen that meets the rule — most of
   * them — must pass `accountIndicator` explicitly, and a menu screen that doesn't must pass
   * `accountIndicator={false}`. The indicator itself renders nothing with fewer than two
   * accounts. */
  accountIndicator?: boolean;
}

interface HeaderNavProps {
  drilledIn: boolean;
  isHome: boolean;
  goHome: () => void;
}

/** Resolves arrival and home navigation from the router. Without a Router (isolated screen
 * tests) the header still renders, as a menu header whose "b-mobile" does nothing. */
export function AppHeader(props: AppHeaderProps) {
  return useHasRouter() ? (
    <RoutedAppHeader {...props} />
  ) : (
    <AppHeaderView {...props} drilledIn={false} isHome={false} goHome={() => undefined} />
  );
}

function RoutedAppHeader(props: AppHeaderProps) {
  return <AppHeaderView {...props} {...useHeaderNav()} />;
}

function AppHeaderView({
  title,
  variant,
  backHref = '/browse',
  onBack,
  onHome,
  end,
  accountIndicator = variant !== 'back',
  drilledIn,
  isHome,
  goHome,
}: AppHeaderProps & HeaderNavProps) {
  const resolved = variant ?? (drilledIn ? 'back' : 'menu');

  function handleHome(event: MouseEvent<HTMLElement>): void {
    if (isHome) {
      // Already home: scroll this page's content to the top.
      const content = event.currentTarget.closest('.ion-page')?.querySelector('ion-content');
      void content?.scrollToTop(300);
      return;
    }
    if (onHome) onHome(goHome);
    else goHome();
  }

  return (
    <IonToolbar
      className="app-header-toolbar"
      style={
        {
          '--background': 'var(--brand-fill)',
          // The button/back-arrow icon reads --ion-toolbar-color internally (confirmed via
          // computed style — a plain --color override here is never consumed), which theme.css
          // sets globally to --ink; this local override is what actually turns it white.
          '--ion-toolbar-color': 'var(--on-brand-fill)',
          '--min-height': '48px',
          // Ionic 9 types `--background` on `style` as its own property, so a plain object literal
          // no longer fits CSSProperties.
        } as CSSProperties
      }
    >
      <IonButtons slot="start">
        {resolved === 'back' ? (
          // Same IonBackButton (so the same arrow icon and position) either way; a supplied
          // onClick replaces its pop-navigation entirely (IonBackButton spreads props after its
          // own click handler), which is exactly what a confirm-before-discard screen needs.
          <IonBackButton
            defaultHref={backHref}
            text=""
            {...(onBack ? { onClick: onBack, 'aria-label': 'Back' } : {})}
          />
        ) : (
          <IonMenuButton />
        )}
        <button
          type="button"
          aria-label="b-mobile, go to Browse"
          onClick={handleHome}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 4px',
            color: 'inherit',
            font: 'inherit',
            fontWeight: 700,
            fontSize: '16px',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            marginLeft: '4px',
            cursor: 'pointer',
          }}
        >
          b-mobile
        </button>
      </IonButtons>
      <IonButtons slot="end">
        <span
          style={{
            fontWeight: 600,
            fontSize: '16px',
            whiteSpace: 'nowrap',
            // Constant, not conditional on `end`/the indicator rendering (it renders nothing
            // with <2 accounts), so the title's right edge is the same on every screen that
            // has no avatar: IonButtons' own ~4px + this 12px = the app's 16px gutter.
            marginRight: '12px',
          }}
        >
          {title}
        </span>
        {end}
        {accountIndicator && <AccountIndicator />}
      </IonButtons>
    </IonToolbar>
  );
}
