// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-05 — Tag Entries. A single infinite-scroll grid, same paging shape as SCR-02's feed tabs.

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
} from '@ionic/react';
import { usePagedResource } from '../../data/usePagedResource.js';
import { fetchTagPage } from '../../data/entries.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';

interface TagEntriesScreenProps {
  tag: string;
}

export function TagEntriesScreen({ tag }: TagEntriesScreenProps) {
  const navigate = useAppNavigate();
  const resource = usePagedResource((pageIndex) => fetchTagPage(tag, pageIndex), [tag]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/browse" />
          </IonButtons>
          <IonTitle>#{tag}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {resource.status === 'loading' && (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {resource.status === 'error' && (
          <div className="ion-padding">
            <IonText color="danger">
              <p>{resource.errorMessage}</p>
            </IonText>
            <IonButton onClick={resource.refresh}>Retry</IonButton>
          </div>
        )}
        {resource.status === 'empty' && (
          <div className="ion-padding">
            <p>No entries tagged &lsquo;{tag}&rsquo;.</p>
          </div>
        )}
        {resource.status === 'loaded' && (
          <EntryGrid
            entries={resource.items}
            onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
            hasMore={resource.hasMore}
            onLoadMore={resource.loadMore}
            onRefresh={resource.refresh}
          />
        )}
      </IonContent>
    </IonPage>
  );
}
