// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Stands in for a not-yet-built screen so the route table (§5) can be wired up and verified end
// to end before each real screen lands. Every route in src/app/routes/AppRoutes.tsx points here
// until its own phase replaces it with a real screens/SCR-NN-*/ component.

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonMenuButton,
  IonButtons,
  IonPage,
} from '@ionic/react';

interface ScreenPlaceholderProps {
  screenId: string;
  title: string;
}

export function ScreenPlaceholder({ screenId, title }: ScreenPlaceholderProps) {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonMenuButton />
          </IonButtons>
          <IonTitle>{title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p>
          {screenId} — {title} — not yet built.
        </p>
      </IonContent>
    </IonPage>
  );
}
