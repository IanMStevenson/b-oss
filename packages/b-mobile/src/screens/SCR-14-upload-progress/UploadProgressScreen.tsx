// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-14 — Upload Progress. Reads uploadQueueStore directly (§9) — a plain Zustand hook, so it's
// always correct after navigating away and back (the list *is* the durable queue, not a snapshot
// of it) and updates live as flows/uploadQueueRunner.ts mutates items. No percentage progress bar
// — a deliberate scope reduction (see AGENT_LOG.md's Phase 7 entry): SCR-14's own acceptance
// criteria only require the four statuses to display and update live, which this gives in full;
// wiring FileTransfer's own progress events through the MultipartImpl seam would be a bigger,
// separate change to b-api's shared contract for a bar the spec doesn't actually require.

import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonContent,
  IonText,
} from '@ionic/react';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useUploadQueueStore } from '../../state/uploadQueueStore.js';
import type { UploadQueueItem, UploadStatus } from '../../state/uploadQueueStore.js';

// Plain glyphs, matching SCR-14's own wireframe ("✔ Uploaded", "⟳ Uploading…", "⏳ Waiting",
// "✖ Failed") — no new icon-set dependency for four static glyphs.
const STATUS_LABEL: Record<UploadStatus, string> = {
  waiting: '⏳ Waiting',
  uploading: '⟳ Uploading…',
  uploaded: '✔ Uploaded',
  failed: '✖ Failed',
};

const STATUS_COLOR: Record<UploadStatus, string> = {
  waiting: 'medium',
  uploading: 'primary',
  uploaded: 'success',
  failed: 'danger',
};

export function UploadProgressScreen() {
  const navigate = useAppNavigate();
  const items = useUploadQueueStore((s) => s.items);
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);

  function handleTap(item: UploadQueueItem): void {
    if (item.status === 'uploaded' && item.resultEntryId) {
      navigate.push(`/entry/${item.resultEntryId}`);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonMenuButton />
          </IonButtons>
          <IonTitle>Uploads</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {sorted.length === 0 && (
          <IonText color="medium">
            <p>Nothing queued or recently uploaded.</p>
          </IonText>
        )}

        {sorted.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleTap(item)}
            disabled={item.status !== 'uploaded'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '8px 0',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              background: 'none',
              textAlign: 'left',
              cursor: item.status === 'uploaded' ? 'pointer' : 'default',
            }}
          >
            <div style={{ flex: 1 }}>
              <div>{item.displayTitle}</div>
              <IonText
                color={STATUS_COLOR[item.status] as 'medium' | 'primary' | 'success' | 'danger'}
              >
                <p style={{ margin: 0 }}>
                  {STATUS_LABEL[item.status]}
                  {item.status === 'failed' && item.error ? ` — ${item.error}` : ''}
                </p>
              </IonText>
            </div>
          </button>
        ))}
      </IonContent>
    </IonPage>
  );
}
