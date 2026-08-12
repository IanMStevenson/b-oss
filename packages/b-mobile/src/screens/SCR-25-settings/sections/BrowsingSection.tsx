// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Browsing section (App Settings). Three device-local EntryGrid/ThumbnailGrid display
// prefs, same immediate-persist pattern as MiscSection (no Save/Cancel — nothing here is
// account-scoped or server-backed). Margins uses an IonSegment, matching the exclusive-choice
// picker BrowseScreen's own feed tabs already use, rather than introducing IonRadioGroup as a
// second pattern for the same kind of control.

import { IonCheckbox, IonSegment, IonSegmentButton, IonLabel, IonText } from '@ionic/react';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';

export function BrowsingSection() {
  const showZoomBar = useDevicePrefsStore((s) => s.showZoomBar);
  const setShowZoomBar = useDevicePrefsStore((s) => s.setShowZoomBar);
  const showPagination = useDevicePrefsStore((s) => s.showPagination);
  const setShowPagination = useDevicePrefsStore((s) => s.setShowPagination);
  const thumbnailMargins = useDevicePrefsStore((s) => s.thumbnailMargins);
  const setThumbnailMargins = useDevicePrefsStore((s) => s.setThumbnailMargins);

  return (
    <div className="ion-padding">
      <IonCheckbox checked={showZoomBar} onIonChange={(e) => setShowZoomBar(e.detail.checked)}>
        Show zoom bar
      </IonCheckbox>
      <IonText color="medium">
        <p>
          Pinch to zoom always works on the thumbnail grid — this just shows or hides the on-screen
          zoom buttons.
        </p>
      </IonText>

      <IonCheckbox
        checked={showPagination}
        onIonChange={(e) => setShowPagination(e.detail.checked)}
      >
        Show pagination
      </IonCheckbox>
      <IonText color="medium">
        <p>
          Hides the page number row below the grid — swipe left/right still moves between pages.
        </p>
      </IonText>

      <div style={{ marginTop: 24 }}>
        <IonText>
          <p style={{ marginBottom: 8 }}>Margins</p>
        </IonText>
        <IonSegment
          value={thumbnailMargins}
          onIonChange={(e) => setThumbnailMargins(e.detail.value as 'none' | 'narrow' | 'normal')}
        >
          <IonSegmentButton value="normal">
            <IonLabel>Normal</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="narrow">
            <IonLabel>Narrow</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="none">
            <IonLabel>None</IonLabel>
          </IonSegmentButton>
        </IonSegment>
        <IonText color="medium">
          <p>
            Narrow keeps the same number of columns as Normal but shrinks the margins and gaps
            between thumbnails. None removes margins entirely — at that point, zoom controls how
            many thumbnails fit in each row.
          </p>
        </IonText>
      </div>
    </div>
  );
}
