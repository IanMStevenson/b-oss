// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 App settings → Appearance (b-oss#734): everything about how b-mobile looks on this phone —
// theme, the account picture style, the thumbnail grid, the entry photo size — plus the
// blipfoto.com link-handling toggle in a captioned Links section. Merges the old App → General
// (theme, account picture, links) and Browsing pages. All device-local and applied immediately, no
// Save/Cancel. Margins and Photo size are IonSegments in the pill style (`settings-pill-segment`,
// globals.css) so they read as a choice rather than as tab navigation. The account picture row only
// matters with two or more accounts stored, so it is hidden below that.

import { IonList } from '@ionic/react';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { t } from '../../../strings/index.js';
import {
  CaptionRow,
  SectionHeader,
  SegmentRow,
  ToggleRow,
} from '../../../components/SettingsForm.js';

export function AppearanceSection() {
  const theme = useDevicePrefsStore((s) => s.theme);
  const setTheme = useDevicePrefsStore((s) => s.setTheme);
  const accountAvatarStyle = useDevicePrefsStore((s) => s.accountAvatarStyle);
  const setAccountAvatarStyle = useDevicePrefsStore((s) => s.setAccountAvatarStyle);
  const accountCount = useAccountsStore((s) => s.accounts.length);
  const openLinksInApp = useDevicePrefsStore((s) => s.openBlipfotoLinksInApp);
  const setOpenLinksInApp = useDevicePrefsStore((s) => s.setOpenBlipfotoLinksInApp);
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

      <SectionHeader>Theme</SectionHeader>
      <SegmentRow
        label="Theme"
        value={theme}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'mid', label: 'Mid' },
        ]}
        onChange={setTheme}
      />
      <CaptionRow>
        System follows your phone&rsquo;s dark theme setting (Light or Dark). Mid is a softer dark
        grey you can choose here.
      </CaptionRow>

      {accountCount >= 2 && (
        <>
          <SectionHeader>Account picture</SectionHeader>
          <SegmentRow
            label="Account picture"
            value={accountAvatarStyle}
            options={[
              { value: 'picture', label: 'Profile picture' },
              { value: 'icon', label: 'Icon' },
            ]}
            onChange={setAccountAvatarStyle}
          />
          <CaptionRow>How each account is shown in the switcher and header.</CaptionRow>
        </>
      )}

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

      <SectionHeader>Links</SectionHeader>
      <ToggleRow
        label="Open blipfoto.com links in this app"
        caption="When on, blipfoto.com links you tap in other apps open here instead of in your browser."
        checked={openLinksInApp}
        onChange={setOpenLinksInApp}
      />
    </IonList>
  );
}
