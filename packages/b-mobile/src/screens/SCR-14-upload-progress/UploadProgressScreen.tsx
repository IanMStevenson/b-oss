// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-14 — Upload Progress. Reads uploadQueueStore directly (§9) — a plain Zustand hook, so it's
// always correct after navigating away and back (the list *is* the durable queue, not a snapshot
// of it) and updates live as flows/uploadQueueRunner.ts mutates items. No percentage progress bar
// — a deliberate scope reduction: SCR-14's own acceptance
// criteria only require the four statuses to display and update live, which this gives in full;
// wiring FileTransfer's own progress events through the MultipartImpl seam would be a bigger,
// separate change to b-api's shared contract for a bar the spec doesn't actually require.
//
// A failed item gets Retry and Remove (b-oss#342) — otherwise it would sit in the list for good.
// Its row is a plain div rather than the tappable button, since the actions can't nest inside it.

import { useState } from 'react';
import { IonPage, IonHeader, IonContent, IonProgressBar, IonButton, IonAlert } from '@ionic/react';
import { CircleAlert, CircleCheck, Clock, CloudUpload, LoaderCircle } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.js';
import type { ReactNode } from 'react';
import { AppHeader } from '../../components/AppHeader.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { retryUploadItem, removeUploadItem } from '../../flows/uploadQueueRunner.js';
import { useUploadQueueStore } from '../../state/uploadQueueStore.js';
import type { UploadQueueItem, UploadStatus } from '../../state/uploadQueueStore.js';
import '../../components/ComposeForm.css';

// Lucide icons in the status chips, replacing the wireframe's emoji glyphs (which render
// differently per platform and ignored the green/red palette).
const STATUS_LABEL: Record<UploadStatus, string> = {
  waiting: 'Waiting',
  uploading: 'Uploading…',
  uploaded: 'Uploaded',
  failed: 'Failed',
};

const STATUS_ICON: Record<UploadStatus, ReactNode> = {
  waiting: <Clock size={16} aria-hidden="true" />,
  uploading: <LoaderCircle size={16} aria-hidden="true" className="upload-spin" />,
  uploaded: <CircleCheck size={16} aria-hidden="true" />,
  failed: <CircleAlert size={16} aria-hidden="true" />,
};

export function UploadProgressScreen() {
  const navigate = useAppNavigate();
  const items = useUploadQueueStore((s) => s.items);
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const [removeTarget, setRemoveTarget] = useState<UploadQueueItem | null>(null);

  function handleTap(item: UploadQueueItem): void {
    if (item.status === 'uploaded' && item.resultEntryId) {
      navigate.push(`/entry/${item.resultEntryId}`);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Uploads" />
      </IonHeader>
      <IonContent>
        {sorted.length === 0 && (
          <EmptyState
            icon={<CloudUpload size={40} strokeWidth={1.5} />}
            title="Nothing queued or recently uploaded."
          />
        )}

        {sorted.map((item) => {
          const body = (
            <>
              <div className="upload-row-text">
                <div className="upload-row-title">{item.displayTitle}</div>
                <div className={`upload-row-status is-${item.status}`}>
                  {STATUS_ICON[item.status]}
                  <span>
                    {STATUS_LABEL[item.status]}
                    {item.status === 'failed' && item.error ? ` — ${item.error}` : ''}
                  </span>
                </div>
                {item.status === 'uploading' && (
                  <IonProgressBar type="indeterminate" className="upload-progress" />
                )}
                {item.status === 'failed' && (
                  <div className="upload-row-actions">
                    <IonButton size="small" onClick={() => retryUploadItem(item.id)}>
                      Retry
                    </IonButton>
                    <IonButton
                      size="small"
                      fill="outline"
                      color="danger"
                      onClick={() => setRemoveTarget(item)}
                    >
                      Remove
                    </IonButton>
                  </div>
                )}
              </div>
              <span className="upload-row-kind">{item.kind === 'edit' ? 'Edit' : 'New entry'}</span>
            </>
          );
          return item.status === 'failed' ? (
            <div key={item.id} className="upload-row">
              {body}
            </div>
          ) : (
            <button
              key={item.id}
              type="button"
              className="upload-row"
              onClick={() => handleTap(item)}
              disabled={item.status !== 'uploaded'}
              style={{ cursor: item.status === 'uploaded' ? 'pointer' : 'default' }}
            >
              {body}
            </button>
          );
        })}
      </IonContent>

      <IonAlert
        isOpen={!!removeTarget}
        header="Remove this upload?"
        message="It will be taken out of the queue and won't be uploaded."
        onDidDismiss={() => setRemoveTarget(null)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Remove',
            role: 'destructive',
            handler: () => {
              if (removeTarget) void removeUploadItem(removeTarget.id);
            },
          },
        ]}
      />
    </IonPage>
  );
}
