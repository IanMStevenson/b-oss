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
import { OverlayProvider } from './OverlayProvider.js';
import { AppRoutes } from './routes/AppRoutes.js';
import { useAccountsStore, useActiveAccount, useCanWrite } from '../state/accountsStore.js';
import { useHiddenMembersStore } from '../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';

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

export function AppShell() {
  useEffect(() => {
    void useAccountsStore.getState().hydrate();
    void useHiddenMembersStore.getState().hydrate();
    void useDevicePrefsStore.getState().hydrate();
  }, []);

  return (
    <IonApp>
      <OverlayProvider>
        <IonReactRouter>
          <NavMenu />
          <IonRouterOutlet id={MAIN_CONTENT_ID}>
            <AppRoutes />
          </IonRouterOutlet>
        </IonReactRouter>
      </OverlayProvider>
    </IonApp>
  );
}
