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

import type { CSSProperties, ReactNode } from 'react';
import { IonToolbar, IonButtons, IonMenuButton, IonBackButton } from '@ionic/react';
import { AccountIndicator } from './AccountIndicator.js';

interface AppHeaderProps {
  title: string;
  /** 'menu' for anything reachable directly from NavMenu; 'back' for everything reached by
   * drilling in from another screen. Same position either way. */
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
  /** Extra content after the title (e.g. AccountIndicator) — kept optional rather than every
   * screen reimplementing the same IonButtons/slot="end" wrapper. */
  end?: ReactNode;
  /** Mount the account switcher avatar after `end`. Defaults to on for variant="menu" (the
   * spec's primary-chrome screens: Browse, Search, Map, My profile, Notifications, Comments,
   * Settings, Help, Uploads) and off for back screens; pass explicitly to override either way
   * (e.g. false on a drawer destination the spec doesn't list, true on a drill-in that has it).
   * The indicator itself renders nothing with fewer than two accounts. */
  accountIndicator?: boolean;
}

export function AppHeader({
  title,
  variant = 'menu',
  backHref = '/browse',
  onBack,
  end,
  accountIndicator = variant === 'menu',
}: AppHeaderProps) {
  return (
    <IonToolbar
      style={
        {
          '--background': 'var(--green-800)',
          // The button/back-arrow icon reads --ion-toolbar-color internally (confirmed via
          // computed style — a plain --color override here is never consumed), which theme.css
          // sets globally to --ink; this local override is what actually turns it white.
          '--ion-toolbar-color': '#fff',
          '--min-height': '48px',
          // Ionic 9 types `--background` on `style` as its own property, so a plain object literal
          // no longer fits CSSProperties.
        } as CSSProperties
      }
    >
      <IonButtons slot="start">
        {variant === 'back' ? (
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
        <span
          style={{
            fontWeight: 700,
            fontSize: '16px',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            marginLeft: '4px',
          }}
        >
          b-mobile
        </span>
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
