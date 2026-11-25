// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one guard for an unsaved draft (b-oss#1059). Every in-app route change goes through the router
// (react-router's navigator, and Ionic's NavContext for menu links), so wrapping those two once here
// covers the side menu and tabs, notification and deep-link taps, links to an entry or profile, the
// sign-in return, and the header's own Back/Home. Android's hardware Back never reaches the router
// before Ionic has decided, so it has its own `ionBackButton` handler. When the draft has unsaved
// changes and the move would leave it, the member is asked (the "Discard / Keep editing" dialog of
// #1057); Keep editing drops the move, Discard clears the draft and carries it out. Moves to the
// draft's own screens, and moves with no unsaved changes, pass straight through. The screens' own
// guarded Back and Home still ask first themselves and clear the draft before they navigate.
//
// Not covered here: the window or page going away (desktop quit and reload, a browser tab closing),
// which are the unload guard's job (platform/unloadGuard.ts); the OS killing the app can't be asked.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NavContext } from '@ionic/react';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';
import type { To } from 'react-router-dom';
import { ReplaceDraftAlert } from '../../components/ReplaceDraftAlert.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import type { ComposeDraft } from '../../state/composeDraftStore.js';
import { backLeavesDraft, navigationLeavesDraft } from '../../state/draftLeave.js';

/** Above the router's own Back handler (0) and the Browse swallow (1); below Ionic's menu (99) and
 * overlays (100), so an open dialog or drawer still takes Back first. */
export const DRAFT_BACK_PRIORITY = 2;

interface LeaveGuard {
  /** Runs `run` at once if nothing unsaved would be lost, else after the member agrees to Discard. */
  confirmLeave: (run: () => void) => void;
}

const LeaveGuardContext = createContext<LeaveGuard>({ confirmLeave: (run) => run() });

/** For moves that are not route changes but still take the member away from the draft (switching
 * account). Outside the guard it simply runs. */
export function useDraftLeaveGuard(): LeaveGuard {
  return useContext(LeaveGuardContext);
}

function toPath(to: To): string {
  return typeof to === 'string' ? to : (to.pathname ?? '');
}

interface BackButtonDetail {
  register: (priority: number, handler: (processNextHandler: () => void) => void) => void;
}

export function DraftNavigationGuard({ children }: { children: ReactNode }) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const ionNav = useContext(NavContext);
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [asking, setAsking] = useState<{ draft: ComposeDraft; run: () => void } | null>(null);

  // Ask about `draft` (the one that would be lost), then run the move on Discard.
  const askRef = useRef((draft: ComposeDraft, run: () => void) => setAsking({ draft, run }));
  askRef.current = (draft, run) => setAsking({ draft, run });

  const guard = useMemo<LeaveGuard>(
    () => ({
      confirmLeave: (run) => {
        const draft = useComposeDraftStore.getState().draft;
        if (draft?.dirty) askRef.current(draft, run);
        else run();
      },
    }),
    [],
  );

  const guardedNavigator = useMemo(() => {
    const ifAllowed = (to: To, run: () => void): void => {
      const draft = useComposeDraftStore.getState().draft;
      if (navigationLeavesDraft(draft, toPath(to)) && draft) askRef.current(draft, run);
      else run();
    };
    return {
      ...navigator,
      push: (to: To, state?: unknown, opts?: unknown) =>
        ifAllowed(to, () => navigator.push(to, state, opts as never)),
      replace: (to: To, state?: unknown, opts?: unknown) =>
        ifAllowed(to, () => navigator.replace(to, state, opts as never)),
      go: (delta: number) => {
        const draft = useComposeDraftStore.getState().draft;
        if (delta < 0 && draft && backLeavesDraft(draft, pathRef.current)) {
          askRef.current(draft, () => navigator.go(delta));
        } else navigator.go(delta);
      },
    };
  }, [navigator]);

  // Ionic's own navigation (menu `routerLink`s, goHome's root navigation).
  const guardedIonNav = useMemo(
    () => ({
      ...ionNav,
      navigate: ((...args: Parameters<typeof ionNav.navigate>) => {
        const draft = useComposeDraftStore.getState().draft;
        const [pathLike] = args;
        const target = typeof pathLike === 'string' ? pathLike : '';
        if (draft && navigationLeavesDraft(draft, target)) {
          askRef.current(draft, () => ionNav.navigate(...args));
        } else ionNav.navigate(...args);
      }) as typeof ionNav.navigate,
      goBack: ((...args: Parameters<typeof ionNav.goBack>) => {
        const draft = useComposeDraftStore.getState().draft;
        if (draft && backLeavesDraft(draft, pathRef.current)) {
          askRef.current(draft, () => ionNav.goBack(...args));
        } else ionNav.goBack(...args);
      }) as typeof ionNav.goBack,
    }),
    [ionNav],
  );

  useEffect(() => {
    const onBack = (e: Event) => {
      (e as CustomEvent<BackButtonDetail>).detail.register(
        DRAFT_BACK_PRIORITY,
        (processNextHandler: () => void) => {
          const draft = useComposeDraftStore.getState().draft;
          if (draft && backLeavesDraft(draft, pathRef.current)) {
            askRef.current(draft, processNextHandler);
          } else processNextHandler();
        },
      );
    };
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, []);

  const clearDraft = useComposeDraftStore((s) => s.clearDraft);
  return (
    <LeaveGuardContext.Provider value={guard}>
      <UNSAFE_NavigationContext.Consumer>
        {(nav) => (
          <UNSAFE_NavigationContext.Provider value={{ ...nav, navigator: guardedNavigator }}>
            <NavContext.Provider value={guardedIonNav}>
              {children}
              {asking && (
                <ReplaceDraftAlert
                  draft={asking?.draft ?? null}
                  onKeepEditing={() => setAsking(null)}
                  onDiscard={() => {
                    const run = asking?.run;
                    setAsking(null);
                    clearDraft();
                    run?.();
                  }}
                />
              )}
            </NavContext.Provider>
          </UNSAFE_NavigationContext.Provider>
        )}
      </UNSAFE_NavigationContext.Consumer>
    </LeaveGuardContext.Provider>
  );
}
