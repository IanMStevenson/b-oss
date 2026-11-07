// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Launch-time notice for GitHub-installer users that b-ark is on the Microsoft Store.
// Whether it is on offer is decided in the main process; priority against other notices here.
import {
  StoreNoticeBanner as StoreNoticeBannerView,
  shouldShowStoreNotice,
} from '@b-oss/b-ark-ui-components';
import { useApp } from '../context/AppContext.js';

export function StoreNoticeBanner() {
  const { state, backend } = useApp();
  if (!state.store || !shouldShowStoreNotice(state.store)) return null;
  return (
    <StoreNoticeBannerView
      onDismiss={() => void backend.dismissStoreNotice?.()}
      onSnooze={() => void backend.snoozeStoreNotice?.()}
    />
  );
}
