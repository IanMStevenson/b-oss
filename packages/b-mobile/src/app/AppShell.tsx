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
import { OverlayProvider } from './OverlayProvider.js';
import { AppRoutes } from './routes/AppRoutes.js';
import { useAccountsStore, useActiveAccount, useCanWrite } from '../state/accountsStore.js';
import { useHiddenMembersStore } from '../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import { useNotificationCountsStore } from '../state/notificationCountsStore.js';
import { startUploadQueueRunner } from '../flows/uploadQueueRunner.js';
import { onReminderTapped } from '../platform/localNotifications.js';
import { switchAccount, handleForcedLogout } from '../flows/accountsFlow.js';
import { onPushReceived, onPushTapped, onPushTokenChanged } from '../platform/push.js';
import { runLaunchBackstopCheck, handleDeviceTokenRotated } from '../flows/pushFlow.js';

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
    const accountsHydrated = useAccountsStore.getState().hydrate();
    void useHiddenMembersStore.getState().hydrate();
    void useDevicePrefsStore.getState().hydrate();
    // The upload queue (§9) has non-React consumers by design — started once here rather than
    // from any one screen, so a background upload resumes even if the app launches straight into
    // a route that never touches uploadQueueStore itself.
    startUploadQueueRunner();
    // FLW-16 step 8 — the launch-time backstop, run once accounts are known (it reads
    // accountsStore directly, not via a React selector, so it just needs hydrate() to resolve).
    void accountsHydrated.then(() => runLaunchBackstopCheck());
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
          <IonRouterOutlet id={MAIN_CONTENT_ID}>
            <AppRoutes />
          </IonRouterOutlet>
        </IonReactRouter>
      </OverlayProvider>
    </IonApp>
  );
}
