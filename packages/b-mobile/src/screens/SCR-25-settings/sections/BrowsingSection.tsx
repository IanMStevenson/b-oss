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
  const photoFit = useDevicePrefsStore((s) => s.photoFit);
  const setPhotoFit = useDevicePrefsStore((s) => s.setPhotoFit);

  return (
    <div className="ion-padding">
      <IonCheckbox checked={showZoomBar} onIonChange={(e) => setShowZoomBar(e.detail.checked)}>
        Show zoom/navigation bar
      </IonCheckbox>
      <IonText color="medium">
        <p>
          The row above the thumbnails with Home, search, calendar and the zoom buttons. Turn it off
          to give that line back to the grid — pinch to zoom and swipe to change page still work.
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

      <div style={{ marginTop: 24 }}>
        <IonText>
          <p style={{ marginBottom: 8 }}>Photo size</p>
        </IonText>
        <IonSegment
          aria-label="Photo size"
          value={photoFit}
          onIonChange={(e) => setPhotoFit(e.detail.value as 'full-width' | 'capped')}
        >
          <IonSegmentButton value="full-width">
            <IonLabel>Full width</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="capped">
            <IonLabel>Fit to screen</IonLabel>
          </IonSegmentButton>
        </IonSegment>
        <IonText color="medium">
          <p>
            Full width always fills the screen width, so a tall photo runs past the screen and you
            scroll. Fit to screen shows the whole photo at once, at the cost of width.
          </p>
        </IonText>
      </div>
    </div>
  );
}
