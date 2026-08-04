// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-08 — Entry Metadata (read-only EXIF, reached from SCR-06's overflow menu — not built yet in
// this phase, so this route is reachable directly for now). Same deep-link-resilience tradeoff
// documented in PhotoScreen.tsx applies here: fetches via useLiveEntry rather than being handed
// the entry object from SCR-06.

import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
} from '@ionic/react';
import { useLiveEntry } from '../../data/useLiveEntry.js';
import type { BlipEntry } from '@b-oss/b-view';

interface EntryMetadataScreenProps {
  entryId: string;
}

function metadataFields(exif: NonNullable<BlipEntry['exif']>): Array<[string, string]> {
  const camera = exif.camera ?? ([exif.make, exif.model].filter(Boolean).join(' ') || null);
  return [
    ['Camera', camera],
    ['Exposure', exif.exposure_time],
    ['Aperture', exif.f_number],
    ['Focal length', exif.focal_length],
    ['ISO', exif.iso],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

export function EntryMetadataScreen({ entryId }: EntryMetadataScreenProps) {
  const { entryState, retry } = useLiveEntry(entryId);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/entry/${entryId}`} />
          </IonButtons>
          <IonTitle>Camera info</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {entryState.status === 'loading' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <IonSpinner />
          </div>
        )}

        {entryState.status === 'error' && (
          <div>
            <IonText color="danger">
              <p>{entryState.message}</p>
            </IonText>
            <IonButton onClick={retry}>Retry</IonButton>
          </div>
        )}

        {entryState.status === 'loaded' &&
          (() => {
            const fields = entryState.data.exif ? metadataFields(entryState.data.exif) : [];
            if (fields.length === 0) {
              return <p>No camera information.</p>;
            }
            return (
              <IonList inset>
                {fields.map(([label, value]) => (
                  <IonItem key={label}>
                    <IonLabel>{label}</IonLabel>
                    <IonNote slot="end">{value}</IonNote>
                  </IonItem>
                ))}
              </IonList>
            );
          })()}
      </IonContent>
    </IonPage>
  );
}
