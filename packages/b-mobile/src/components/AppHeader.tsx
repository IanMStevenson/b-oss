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

import type { ReactNode } from 'react';
import { IonToolbar, IonButtons, IonMenuButton, IonBackButton } from '@ionic/react';

interface AppHeaderProps {
  title: string;
  /** 'menu' for anything reachable directly from NavMenu; 'back' for everything reached by
   * drilling in from another screen. Same position either way. */
  variant?: 'menu' | 'back';
  /** Only used for variant="back" — where IonBackButton lands if there's no history to pop to
   * (a deep link opened fresh, not navigated to from within the app). */
  backHref?: string;
  /** Extra content after the title (e.g. AccountIndicator) — kept optional rather than every
   * screen reimplementing the same IonButtons/slot="end" wrapper. */
  end?: ReactNode;
}

export function AppHeader({ title, variant = 'menu', backHref = '/browse', end }: AppHeaderProps) {
  return (
    <IonToolbar
      style={{
        '--background': 'var(--green-800)',
        // The button/back-arrow icon reads --ion-toolbar-color internally (confirmed via
        // computed style — a plain --color override here is never consumed), which theme.css
        // sets globally to --ink; this local override is what actually turns it white.
        '--ion-toolbar-color': '#fff',
        '--min-height': '48px',
      }}
    >
      <IonButtons slot="start">
        {variant === 'back' ? <IonBackButton defaultHref={backHref} text="" /> : <IonMenuButton />}
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
            marginRight: end ? '12px' : '4px',
          }}
        >
          {title}
        </span>
        {end}
      </IonButtons>
    </IonToolbar>
  );
}
