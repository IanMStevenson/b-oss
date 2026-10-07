// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The app shell (§5): IonMenu for primary navigation, a single IonRouterOutlet for the page
// stack — no router-level tabs, since SCR-02's five feeds are in-screen state, not routes.

import { useEffect, useRef } from 'react';
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
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction } from 'react-router-dom';
import type { RefObject } from 'react';
import { OverlayProvider, OverlayHost } from './OverlayProvider.js';
import { renderAppRoutes } from './routes/AppRoutes.js';
import { useAccountsStore, useActiveAccount, useCanWrite } from '../state/accountsStore.js';
import { markAuthReady } from '../state/authReady.js';
import { maybeRunFeedProbe } from '../diagnostics/feedProbe.js';
import { useHiddenMembersStore } from '../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import { useNotificationCountsStore } from '../state/notificationCountsStore.js';
import { startUploadQueueRunner } from '../flows/uploadQueueRunner.js';
import { onReminderTapped } from '../platform/localNotifications.js';
import { refreshAccountAvatars } from '../flows/avatarFlow.js';
import { switchAccount, handleForcedLogout, devSignInWithToken } from '../flows/accountsFlow.js';
import { onPushReceived, onPushTapped, onPushTokenChanged } from '../platform/push.js';
import {
  runLaunchBackstopCheck,
  handleDeviceTokenRotated,
  routeForPushTap,
} from '../flows/pushFlow.js';
import { applyFontScale } from '../platform/accessibility.js';
import { onAppStateChange } from '../platform/appState.js';
import { onAppUrlOpen, getLaunchUrl } from '../platform/deepLinks.js';
import { resolveDeepLink, routeDeepLink } from '../flows/deepLinkResolver.js';
import { checkForSharedImage, onShareReceived } from '../platform/shareIntent.js';

const MAIN_CONTENT_ID = 'main-content';

// React Router 6's useNavigate() returns a new function whenever the location changes. The
// listeners below subscribe once (and DeepLinkListener also consumes the launch URL / shared
// image on mount), so they hold the latest navigate in a ref instead of depending on it —
// otherwise every navigation would tear down and re-run those effects.
function useLatestNavigate(): RefObject<NavigateFunction> {
  const navigate = useNavigate();
  const ref = useRef(navigate);
  ref.current = navigate;
  return ref;
}

// Primary nav per 01-information-architecture.md's navigation map. Every target route already
// exists in AppRoutes (several still as ScreenPlaceholder pending their own phase), so the full
// item set is wired now rather than growing the menu piecemeal each phase. TODO(Phase 5+): the
// (av) account-switcher indicator next to My Profile (rules.md, Multi-account clarity).
function NavMenu() {
  const activeAccount = useActiveAccount();
  const canWrite = useCanWrite();
  const notificationsCount = useNotificationCountsStore((s) => s.notifications);
  const commentsCount = useNotificationCountsStore((s) => s.comments);
  // swipeGesture off: a swipe from the left screen edge was opening this menu by accident (and
  // competing with the in-page swipe navigation). The menu opens from the header button only.
  return (
    <IonMenu contentId={MAIN_CONTENT_ID} swipeGesture={false}>
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

// FLW-16 — receiving/tapping a push. Mounted inside IonReactRouter (needs useNavigate() for tap
// routing), same shape as ReminderTapListener below.
function PushListener() {
  const navigate = useLatestNavigate();
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
      navigate.current(routeForPushTap(payload));
    });
    const offTokenChanged = onPushTokenChanged((token) => {
      void handleDeviceTokenRotated(token);
    });
    return () => {
      offReceived();
      offTapped();
      offTokenChanged();
    };
  }, [navigate]);
  return null;
}

// app-architecture.md §16 — the one place all three inbound paths (cold start's launch URL/share
// intent, warm start's appUrlOpen/share signal) reach their resolvers, so cold and warm start
// can't diverge. Needs Router context for `navigate`, same shape as PushListener/
// ReminderTapListener. The share-intent path only navigates to `/compose` here — the actual
// photo was already consumed into platform/shareIntent.ts's cache by the time this runs (FLW-12
// goes through `/compose`'s own WriteGuardRoute gate before NewEntryScreen ever mounts to pick
// it up; see that module's header comment for why the consumption has to happen here, not there).
function DeepLinkListener() {
  const navigate = useLatestNavigate();
  useEffect(() => {
    void getLaunchUrl().then((url) => {
      if (url) routeDeepLink(resolveDeepLink(url), (path) => navigate.current(path));
    });
    void checkForSharedImage().then((found) => {
      if (found) navigate.current('/compose');
    });
    const offUrlOpen = onAppUrlOpen((url) => {
      routeDeepLink(resolveDeepLink(url), (path) => navigate.current(path));
    });
    const offShareReceived = onShareReceived(() => {
      void checkForSharedImage().then((found) => {
        if (found) navigate.current('/compose');
      });
    });
    return () => {
      offUrlOpen();
      offShareReceived();
    };
  }, [navigate]);
  return null;
}

// FLW-18's "tapping it switches to that account, then opens SCR-09" — needs Router context for
// navigation, so it's mounted inside IonReactRouter rather than alongside the top-level hydrate
// effect above (which has none).
function ReminderTapListener() {
  const navigate = useLatestNavigate();
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
        navigate.current('/compose');
      }),
    [navigate],
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
    // `MODE === 'development'` rather than `DEV` — Vitest also sets `DEV: true`, and a real
    // VITE_DEV_TOKEN in .env.local would otherwise fire a real network call on every test run
    // that mounts AppShell, mutating the live accountsStore singleton in the background.
    //
    // markAuthReady() only fires once this (and hydration) has actually settled — data/client.ts's
    // getClient() awaits authReady before reading accountsStore, so a screen that fetches on
    // mount can't race ahead of the dev-seed's own network round-trip, silently fall back to the
    // anonymous client, and get a confusing "user access token is missing" from a "User auth
    // only" endpoint that's actually rejecting the *anonymous* request, not the real token.
    // .catch() keeps this from ever hanging authReady forever if the seed's own network call fails.
    if (import.meta.env.MODE === 'development' && import.meta.env.VITE_DEV_TOKEN) {
      void accountsHydrated
        .then(async () => {
          if (!useAccountsStore.getState().activeAccountId) {
            await devSignInWithToken(import.meta.env.VITE_DEV_TOKEN as string).catch(() => {});
          }
        })
        .finally(markAuthReady);
    } else {
      void accountsHydrated.finally(markAuthReady);
    }
    // b-oss#196 diagnostic — inert unless built with VITE_FEED_PROBE=1.
    void maybeRunFeedProbe();
    void useHiddenMembersStore.getState().hydrate();
    void useDevicePrefsStore.getState().hydrate();
    // The upload queue (§9) has non-React consumers by design — started once here rather than
    // from any one screen, so a background upload resumes even if the app launches straight into
    // a route that never touches uploadQueueStore itself.
    startUploadQueueRunner();
    // FLW-16 step 8 — the launch-time backstop, run once accounts are known (it reads
    // accountsStore directly, not via a React selector, so it just needs hydrate() to resolve).
    void accountsHydrated.then(() => runLaunchBackstopCheck());
    // Fill in / refresh every account's profile picture (the switcher and header show it).
    void accountsHydrated.then(() => refreshAccountAvatars());
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
          <IonRouterOutlet id={MAIN_CONTENT_ID}>{renderAppRoutes()}</IonRouterOutlet>
        </IonReactRouter>
      </OverlayProvider>
    </IonApp>
  );
}
