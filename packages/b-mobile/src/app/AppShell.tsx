// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The app shell (§5): IonMenu for primary navigation, a single IonRouterOutlet for the page
// stack — no router-level tabs, since SCR-02's five feeds are in-screen state, not routes.

import {
  IonApp,
  IonMenu,
  IonRouterOutlet,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { OverlayProvider } from './OverlayProvider.js';
import { AppRoutes } from './routes/AppRoutes.js';

const MAIN_CONTENT_ID = 'main-content';

export function AppShell() {
  return (
    <IonApp>
      <OverlayProvider>
        <IonReactRouter>
          <IonMenu contentId={MAIN_CONTENT_ID}>
            <IonContent>
              <IonList>
                {/* TODO(Phase 2+): real nav items per 01-information-architecture.md, varying
                    by sign-in state, plus the (av) account-switcher indicator (rules.md). */}
                <IonItem>
                  <IonLabel>b-mobile</IonLabel>
                </IonItem>
              </IonList>
            </IonContent>
          </IonMenu>
          <IonRouterOutlet id={MAIN_CONTENT_ID}>
            <AppRoutes />
          </IonRouterOutlet>
        </IonReactRouter>
      </OverlayProvider>
    </IonApp>
  );
}
