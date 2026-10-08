// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Browsing section (App Settings). Three device-local EntryGrid/ThumbnailGrid display
// prefs, same immediate-persist pattern as MiscSection (no Save/Cancel — nothing here is
// account-scoped or server-backed). Margins and Photo size are IonSegments in the pill style
// (`settings-pill-segment`, globals.css) so they read as a choice rather than as tab navigation;
// a one-line caption says there is no Save because changes apply immediately (UX review X5/X6).

import { IonList } from '@ionic/react';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { t } from '../../../strings/index.js';
import {
  CaptionRow,
  SectionHeader,
  SegmentRow,
  ToggleRow,
} from '../../../components/SettingsForm.js';

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
    <IonList>
      <CaptionRow>{t('SCR-25.browsing.applies_now')}</CaptionRow>

      <SectionHeader>{t('SCR-25.browsing.grid.title')}</SectionHeader>
      <ToggleRow
        label={t('SCR-25.browsing.zoom_bar')}
        caption={t('SCR-25.browsing.zoom_bar.caption')}
        checked={showZoomBar}
        onChange={setShowZoomBar}
      />
      <ToggleRow
        label={t('SCR-25.browsing.pagination')}
        caption={t('SCR-25.browsing.pagination.caption')}
        checked={showPagination}
        onChange={setShowPagination}
      />
      <SegmentRow
        label={t('SCR-25.browsing.margins')}
        value={thumbnailMargins}
        options={[
          { value: 'normal', label: 'Normal' },
          { value: 'narrow', label: 'Narrow' },
          { value: 'none', label: 'None' },
        ]}
        onChange={setThumbnailMargins}
      />
      <CaptionRow>{t('SCR-25.browsing.margins.caption')}</CaptionRow>

      <SectionHeader>{t('SCR-25.browsing.photo.title')}</SectionHeader>
      <SegmentRow
        label={t('SCR-25.browsing.photo_size')}
        value={photoFit}
        options={[
          { value: 'full-width', label: 'Full width' },
          { value: 'capped', label: 'Fit to screen' },
        ]}
        onChange={setPhotoFit}
      />
      <CaptionRow>{t('SCR-25.browsing.photo_size.caption')}</CaptionRow>
    </IonList>
  );
}
