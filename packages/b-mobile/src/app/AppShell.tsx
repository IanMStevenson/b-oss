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
import { useAccountsStore, useActiveAccount } from '../state/accountsStore.js';

const MAIN_CONTENT_ID = 'main-content';

function NavMenu() {
  const activeAccount = useActiveAccount();
  return (
    <IonMenu contentId={MAIN_CONTENT_ID}>
      <IonContent>
        <IonList>
          {/* TODO(Phase 3+): the full nav item set per 01-information-architecture.md, varying
              by sign-in state, plus the (av) account-switcher indicator (rules.md). */}
          <IonMenuToggle autoHide={false}>
            <IonItem routerLink="/browse">
              <IonLabel>Browse</IonLabel>
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
