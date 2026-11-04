// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Runs `refresh` when the app returns to the foreground while this screen is the visible one
// (b-oss#821). The inboxes fetch on mount only, and Ionic keeps a page mounted while the app is
// backgrounded on it, so a push arriving meanwhile (and the tap that reopens the app) would
// otherwise leave the list stale until a manual pull-to-refresh. A page that is mounted but not
// the active view (further down the stack) is skipped: it refreshes when next entered instead.

import { useEffect, useRef } from 'react';
import { useIonViewWillEnter, useIonViewWillLeave } from '@ionic/react';
import { onAppStateChange } from '../platform/appState.js';

export function useRefreshOnResume(refresh: () => void): void {
  const visibleRef = useRef(true);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useIonViewWillEnter(() => {
    visibleRef.current = true;
  });
  useIonViewWillLeave(() => {
    visibleRef.current = false;
  });

  useEffect(
    () =>
      onAppStateChange((isActive) => {
        if (isActive && visibleRef.current) refreshRef.current();
      }),
    [],
  );
}
