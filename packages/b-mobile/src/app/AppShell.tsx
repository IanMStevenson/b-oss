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
  IonMenuToggle,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useHistory } from 'react-router-dom';
import { OverlayProvider } from './OverlayProvider.js';
import { AppRoutes } from './routes/AppRoutes.js';
import { useAccountsStore, useActiveAccount, useCanWrite } from '../state/accountsStore.js';
import { useHiddenMembersStore } from '../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import { startUploadQueueRunner } from '../flows/uploadQueueRunner.js';
import { onReminderTapped } from '../platform/localNotifications.js';
import { switchAccount } from '../flows/accountsFlow.js';

const MAIN_CONTENT_ID = 'main-content';

// Primary nav per 01-information-architecture.md's navigation map. Every target route already
// exists in AppRoutes (several still as ScreenPlaceholder pending their own phase), so the full
// item set is wired now rather than growing the menu piecemeal each phase. TODO(Phase 5+): the
// (av) account-switcher indicator next to My Profile (rules.md, Multi-account clarity).
function NavMenu() {
  const activeAccount = useActiveAccount();
  const canWrite = useCanWrite();
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
                </IonItem>
              </IonMenuToggle>
              <IonMenuToggle autoHide={false}>
                <IonItem routerLink="/comments">
                  <IonLabel>Comments</IonLabel>
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
  useEffect(() => {
    void useAccountsStore.getState().hydrate();
    void useHiddenMembersStore.getState().hydrate();
    void useDevicePrefsStore.getState().hydrate();
    // The upload queue (§9) has non-React consumers by design — started once here rather than
    // from any one screen, so a background upload resumes even if the app launches straight into
    // a route that never touches uploadQueueStore itself.
    startUploadQueueRunner();
  }, []);

  return (
    <IonApp>
      <OverlayProvider>
        <IonReactRouter>
          <NavMenu />
          <ReminderTapListener />
          <IonRouterOutlet id={MAIN_CONTENT_ID}>
            <AppRoutes />
          </IonRouterOutlet>
        </IonReactRouter>
      </OverlayProvider>
    </IonApp>
  );
}
