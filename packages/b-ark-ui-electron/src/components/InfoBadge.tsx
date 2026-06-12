// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron container for the shared InfoBadge: binds the app version from the
// backend; presentation lives in @b-oss/b-ark-ui-components.
import { InfoBadge as InfoBadgeView } from '@b-oss/b-ark-ui-components';
import { useApp } from '../context/AppContext.js';

export function InfoBadge() {
  const { backend } = useApp();
  return <InfoBadgeView appVersion={backend.appVersion} />;
}
