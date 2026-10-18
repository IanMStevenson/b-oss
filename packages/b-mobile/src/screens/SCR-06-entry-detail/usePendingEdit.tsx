// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#412: SCR-13's Save queues the edit (§9) and comes straight back here, so this screen's
// own fetch usually runs before the queued update has gone through and shows the entry as it was.
// While this entry's latest queued edit is waiting or uploading, its new title/description/tags/
// location are laid over the fetched entry with a "Saving your changes…" line. When it goes through,
// the entry is refreshed in place (the overlay stays until the fresh data arrives, so the old
// content never flashes back). If it fails, the overlay drops — the screen shows the entry as it
// is on Blipfoto — with a "not saved" message pointing to Uploads, where it can be retried.
//
// The overlay uses the queued fields exactly as they will be sent: a field left empty on SCR-13
// isn't sent (composeFlow.ts), so it isn't overlaid either.

import { useCallback, useEffect, useRef, useState } from 'react';
import { IonButton, IonText } from '@ionic/react';
import type { BlipEntry } from '@b-oss/b-view';
import { useUploadQueueStore } from '../../state/uploadQueueStore.js';
import type { EditQueueFields, UploadQueueItem } from '../../state/uploadQueueStore.js';

export interface PendingEdit {
  /** The entry with the queued edit laid over it (unchanged when there's nothing to show). */
  apply: (entry: BlipEntry) => BlipEntry;
  saving: boolean;
  /** The failed edit's error message, or null. */
  failedError: string | null;
}

function latestEditFor(items: UploadQueueItem[], entryId: string): UploadQueueItem | undefined {
  let latest: UploadQueueItem | undefined;
  for (const item of items) {
    if (item.kind !== 'edit' || item.entryId !== entryId) continue;
    if (!latest || item.createdAt >= latest.createdAt) latest = item;
  }
  return latest;
}

function applyFields(entry: BlipEntry, fields: EditQueueFields): BlipEntry {
  return {
    ...entry,
    ...(fields.title !== undefined && { title: fields.title }),
    ...(fields.description !== undefined && { description: fields.description }),
    ...(fields.tags !== undefined && {
      tags: fields.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }),
    ...(fields.lat !== undefined &&
      fields.lon !== undefined && { location: { lat: fields.lat, lon: fields.lon } }),
  };
}

export function usePendingEdit(
  entryId: string,
  loadedEntry: BlipEntry | null,
  refresh: () => void,
): PendingEdit {
  const latest = useUploadQueueStore((s) => latestEditFor(s.items, entryId));
  const saving = latest?.status === 'waiting' || latest?.status === 'uploading';

  // An edit that went through while this screen was open: its fields, and the entry that was on
  // screen at that moment — the overlay stays until the refresh replaces that entry.
  const [landed, setLanded] = useState<{
    fields: EditQueueFields;
    shownEntry: BlipEntry | null;
  } | null>(null);
  const previous = useRef<{ id: string; saving: boolean } | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const loadedEntryRef = useRef(loadedEntry);
  loadedEntryRef.current = loadedEntry;

  useEffect(() => {
    const prev = previous.current;
    previous.current = latest ? { id: latest.id, saving } : null;
    if (latest?.status === 'uploaded' && prev?.id === latest.id && prev.saving) {
      setLanded({ fields: latest.fields, shownEntry: loadedEntryRef.current });
      refreshRef.current();
    }
  }, [latest, saving]);

  const overlay: EditQueueFields | null =
    saving && latest
      ? latest.fields
      : landed && loadedEntry === landed.shownEntry
        ? landed.fields
        : null;

  const apply = useCallback(
    (entry: BlipEntry) => (overlay ? applyFields(entry, overlay) : entry),
    [overlay],
  );

  return {
    apply,
    saving,
    failedError: latest?.status === 'failed' ? (latest.error ?? '') : null,
  };
}

export function PendingEditNotice({
  pendingEdit,
  onViewUploads,
}: {
  pendingEdit: PendingEdit;
  onViewUploads: () => void;
}) {
  if (pendingEdit.saving) {
    return (
      <IonText color="medium" className="ion-padding-horizontal">
        <p>Saving your changes…</p>
      </IonText>
    );
  }
  if (pendingEdit.failedError !== null) {
    return (
      <div className="ion-padding">
        <IonText color="danger">
          <p>Your changes to this entry weren&apos;t saved. {pendingEdit.failedError}</p>
        </IonText>
        <IonButton size="small" fill="outline" onClick={onViewUploads}>
          View uploads
        </IonButton>
      </div>
    );
  }
  return null;
}
