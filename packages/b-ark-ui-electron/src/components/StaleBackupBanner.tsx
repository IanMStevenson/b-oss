// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Launch-time notice that b-ark had not backed up for a while. Reuses the amber banner
// view; wording lives in the kit (describeStaleBackup).
import { AmberBanner, describeStaleBackup } from '@b-oss/b-ark-ui-components';
import type { ReasonAction } from '@b-oss/b-ark-ui-components';
import { useApp } from '../context/AppContext.js';

export function StaleBackupBanner() {
  const { state, backend } = useApp();
  const notice = state.store?.staleBackupNotice;
  if (!notice) return null;

  function onAction(action: ReasonAction): void {
    if (action === 'open_startup_settings') void backend.openStartupSettings?.();
    else if (action === 'dismiss') void backend.dismissStaleBackupNotice?.();
  }

  return <AmberBanner reasons={[describeStaleBackup(notice)]} onAction={onAction} />;
}
