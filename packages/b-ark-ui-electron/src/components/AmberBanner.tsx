// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron container for the shared AmberBanner: binds each reason's action to the backend
// or the Settings panel; presentation and wording live in the kit.
import { AmberBanner as AmberBannerView, describeReasons } from '@b-oss/b-ark-ui-components';
import type { ReasonAction } from '@b-oss/b-ark-ui-components';
import type { AccountConfig } from '../backend.js';
import { useApp } from '../context/AppContext.js';

interface Props {
  account: AccountConfig;
}

export function AmberBanner({ account }: Props) {
  const { dispatch, backend } = useApp();
  const reasons = describeReasons(account);

  function onAction(action: ReasonAction): void {
    if (action === 'sign_in') dispatch({ type: 'panel:open', panel: 'settings' });
    else if (action === 'retry') void backend.retryOutstanding(account.id);
    else if (action === 'backup_now') void backend.startBackup(account.id);
    else if (action === 'dismiss') void backend.dismissOutstanding(account.id);
  }

  return <AmberBannerView reasons={reasons} onAction={onAction} />;
}
