// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The app shell (§5): IonMenu for primary navigation, a single IonRouterOutlet for the page
// stack — no router-level tabs, since SCR-02's five feeds are in-screen state, not routes.

import { useEffect } from 'react';
import {
  IonApp,
  IonMenu,
  IonRouterOutlet,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonMenuToggle,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useHistory } from 'react-router-dom';
import { OverlayProvider, OverlayHost } from './OverlayProvider.js';
import { AppRoutes } from './routes/AppRoutes.js';
import { useAccountsStore, useActiveAccount, useCanWrite } from '../state/accountsStore.js';
import { useHiddenMembersStore } from '../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import { useNotificationCountsStore } from '../state/notificationCountsStore.js';
import { startUploadQueueRunner } from '../flows/uploadQueueRunner.js';
import { onReminderTapped } from '../platform/localNotifications.js';
import { switchAccount, handleForcedLogout, devSignInWithToken } from '../flows/accountsFlow.js';
import { onPushReceived, onPushTapped, onPushTokenChanged } from '../platform/push.js';
import { runLaunchBackstopCheck, handleDeviceTokenRotated } from '../flows/pushFlow.js';
import { applyFontScale } from '../platform/accessibility.js';
import { onAppStateChange } from '../platform/appState.js';
import { onAppUrlOpen, getLaunchUrl } from '../platform/deepLinks.js';
import { resolveDeepLink, routeDeepLink } from '../flows/deepLinkResolver.js';
import { checkForSharedImage, onShareReceived } from '../platform/shareIntent.js';

const MAIN_CONTENT_ID = 'main-content';

// Primary nav per 01-information-architecture.md's navigation map. Every target route already
// exists in AppRoutes (several still as ScreenPlaceholder pending their own phase), so the full
// item set is wired now rather than growing the menu piecemeal each phase. TODO(Phase 5+): the
// (av) account-switcher indicator next to My Profile (rules.md, Multi-account clarity).
function NavMenu() {
  const activeAccount = useActiveAccount();
  const canWrite = useCanWrite();
  const notificationsCount = useNotificationCountsStore((s) => s.notifications);
  const commentsCount = useNotificationCountsStore((s) => s.comments);
  return (
    <IonMenu contentId={MAIN_CONTENT_ID}>
      <IonContent>
        <IonList>
          {canWrite && (
            <IonMenuToggle autoHide={false}>
              <IonItem routerLink="/compose">
                <IonLabel>New Entry</IonLabel>
              </IonItem>
            </IonMenuToggle>
          )}
          <IonMenuToggle autoHide={false}>
            <IonItem routerLink="/browse">
              <IonLabel>Browse</IonLabel>
            </IonItem>
          </IonMenuToggle>
          <IonMenuToggle autoHide={false}>
            <IonItem routerLink="/search">
              <IonLabel>Search</IonLabel>
            </IonItem>
          </IonMenuToggle>
          <IonMenuToggle autoHide={false}>
            <IonItem routerLink="/map">
              <IonLabel>Map</IonLabel>
            </IonItem>
          </IonMenuToggle>
          {activeAccount && (
            <>
              <IonMenuToggle autoHide={false}>
                <IonItem routerLink="/me">
                  <IonLabel>My Profile</IonLabel>
                </IonItem>
              </IonMenuToggle>
              <IonMenuToggle autoHide={false}>
                <IonItem routerLink="/notifications">
                  <IonLabel>Notifications</IonLabel>
                  {notificationsCount > 0 && <IonBadge slot="end">{notificationsCount}</IonBadge>}
                </IonItem>
              </IonMenuToggle>
              <IonMenuToggle autoHide={false}>
                <IonItem routerLink="/comments">
                  <IonLabel>Comments</IonLabel>
                  {commentsCount > 0 && <IonBadge slot="end">{commentsCount}</IonBadge>}
                </IonItem>
              </IonMenuToggle>
              <IonMenuToggle autoHide={false}>
                <IonItem routerLink="/settings">
                  <IonLabel>Settings</IonLabel>
                </IonItem>
              </IonMenuToggle>
            </>
          )}
          <IonMenuToggle autoHide={false}>
            <IonItem routerLink="/help">
              <IonLabel>Help & Info</IonLabel>
            </IonItem>
          </IonMenuToggle>
          <IonMenuToggle autoHide={false}>
            <IonItem routerLink="/accounts">
              <IonLabel>Accounts</IonLabel>
            </IonItem>
          </IonMenuToggle>
          {activeAccount && (
            <IonMenuToggle autoHide={false}>
              <IonItem routerLink="/hidden">
                <IonLabel>Hidden members</IonLabel>
              </IonItem>
            </IonMenuToggle>
          )}
          {!activeAccount && (
            <IonMenuToggle autoHide={false}>
              <IonItem routerLink="/sign-in">
                <IonLabel>Sign in</IonLabel>
              </IonItem>
            </IonMenuToggle>
          )}
        </IonList>
      </IonContent>
    </IonMenu>
  );
}

// FLW-16 — receiving/tapping a push. Mounted inside IonReactRouter (needs useHistory() for tap
// routing), same shape as ReminderTapListener below.
function PushListener() {
  const history = useHistory();
  useEffect(() => {
    const offReceived = onPushReceived((payload) => {
      if (payload.kind === 'reauth-required') {
        // FLW-16 step 7: "receiving it (tap or not) feeds FLW-02's... handling immediately" —
        // this is the tap-independent half, for when the push arrives while the app is in the
        // foreground. The tap-independent case while the app *isn't* running is covered by the
        // next launch's backstop check (runLaunchBackstopCheck) instead, since there is no
        // custom background message handler (§11's deliberate choice — see platform/push.ts).
        handleForcedLogout(payload.accountId, 'service');
        return;
      }
      // A push carries no per-stream detail beyond which one moved (§11) — refreshing both
      // totals is simpler than threading the payload's `stream` through and no more expensive,
      // since `messages/totals/unread` is one call for both counts already.
      void useNotificationCountsStore.getState().refresh();
    });
    const offTapped = onPushTapped((payload) => {
      if (payload.kind === 'reauth-required') {
        // handleForcedLogout() may run a second time here (also called from onPushReceived
        // above, or already applied by a prior launch's backstop check) — idempotent either way,
        // since it only clears state that may already be cleared.
        handleForcedLogout(payload.accountId, 'service');
        history.push('/accounts');
        return;
      }
      history.push(payload.stream === 'comments' ? '/comments' : '/notifications');
    });
    const offTokenChanged = onPushTokenChanged((token) => {
      void handleDeviceTokenRotated(token);
    });
    return () => {
      offReceived();
      offTapped();
      offTokenChanged();
    };
  }, [history]);
  return null;
}

// app-architecture.md §16 — the one place all three inbound paths (cold start's launch URL/share
// intent, warm start's appUrlOpen/share signal) reach their resolvers, so cold and warm start
// can't diverge. Needs Router context for `history.push`, same shape as PushListener/
// ReminderTapListener. The share-intent path only navigates to `/compose` here — the actual
// photo was already consumed into platform/shareIntent.ts's cache by the time this runs (FLW-12
// goes through `/compose`'s own WriteGuardRoute gate before NewEntryScreen ever mounts to pick
// it up; see that module's header comment for why the consumption has to happen here, not there).
function DeepLinkListener() {
  const history = useHistory();
  useEffect(() => {
    void getLaunchUrl().then((url) => {
      if (url) routeDeepLink(resolveDeepLink(url), (path) => history.push(path));
    });
    void checkForSharedImage().then((found) => {
      if (found) history.push('/compose');
    });
    const offUrlOpen = onAppUrlOpen((url) => {
      routeDeepLink(resolveDeepLink(url), (path) => history.push(path));
    });
    const offShareReceived = onShareReceived(() => {
      void checkForSharedImage().then((found) => {
        if (found) history.push('/compose');
      });
    });
    return () => {
      offUrlOpen();
      offShareReceived();
    };
  }, [history]);
  return null;
}

// FLW-18's "tapping it switches to that account, then opens SCR-09" — needs Router context for
// navigation, so it's mounted inside IonReactRouter rather than alongside the top-level hydrate
// effect above (which has none).
function ReminderTapListener() {
  const history = useHistory();
  useEffect(
    () =>
      onReminderTapped((accountId) => {
        const active = useAccountsStore.getState().activeAccountId;
        if (active !== accountId) {
          try {
            switchAccount(accountId);
          } catch {
            // Account no longer stored, or needs reauth — nothing sensible to switch to; still open
            // compose so the tap isn't a dead end, against whichever account ends up active.
          }
        }
        history.push('/compose');
      }),
    [history],
  );
  return null;
}

export function AppShell() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);

  useEffect(() => {
    void applyFontScale();
    const accountsHydrated = useAccountsStore.getState().hydrate();
    // Dev-only, desktop-browser convenience: real OAuth needs a captured `bmobile://` redirect
    // (platform/deepLinks.ts), which no desktop browser can deliver. VITE_DEV_TOKEN — a token
    // obtained outside the app, e.g. Blipfoto's own app-admin pages — lets §19's "browser-mode
    // development" cover signed-in screens too. Only fires when no account is already active, so
    // it seeds once and never fights a real sign-in/switch-account/sign-out done afterwards.
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_TOKEN) {
      void accountsHydrated.then(() => {
        if (!useAccountsStore.getState().activeAccountId) {
          void devSignInWithToken(import.meta.env.VITE_DEV_TOKEN as string);
        }
      });
    }
    void useHiddenMembersStore.getState().hydrate();
    void useDevicePrefsStore.getState().hydrate();
    // The upload queue (§9) has non-React consumers by design — started once here rather than
    // from any one screen, so a background upload resumes even if the app launches straight into
    // a route that never touches uploadQueueStore itself.
    startUploadQueueRunner();
    // FLW-16 step 8 — the launch-time backstop, run once accounts are known (it reads
    // accountsStore directly, not via a React selector, so it just needs hydrate() to resolve).
    void accountsHydrated.then(() => runLaunchBackstopCheck());
    // rules.md: "returning from system settings is not assumed to have succeeded" — re-run the
    // same backstop check on every resume, not only at launch, since the OS permission (or the
    // service's registration health) may have changed while the app was backgrounded.
    return onAppStateChange((isActive) => {
      if (isActive) void runLaunchBackstopCheck();
    });
  }, []);

  // Notification-count badges are per-account (a server figure for whichever account is
  // authenticated) — refetched whenever the active account changes, and zeroed rather than left
  // showing a stale number when there's no account (or the incoming one, before its own fetch
  // resolves) to own them.
  useEffect(() => {
    useNotificationCountsStore.getState().reset();
    if (activeAccountId) {
      void useNotificationCountsStore.getState().refresh();
    }
  }, [activeAccountId]);

  return (
    <IonApp>
      <OverlayProvider>
        <IonReactRouter>
          <NavMenu />
          <ReminderTapListener />
          <PushListener />
          <DeepLinkListener />
          <OverlayHost />
          <IonRouterOutlet id={MAIN_CONTENT_ID}>
            <AppRoutes />
          </IonRouterOutlet>
        </IonReactRouter>
      </OverlayProvider>
    </IonApp>
  );
}
