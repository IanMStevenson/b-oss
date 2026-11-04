// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Container for the shared StartupTaskBanner. Only does anything in Microsoft Store builds, where
// the backend reports a Windows startup-task state; elsewhere getStartupTask is absent or null.
import { useCallback, useEffect, useState } from 'react';
import {
  StartupTaskBanner as StartupTaskBannerView,
  describeStartupTask,
} from '@b-oss/b-ark-ui-components';
import type { StartupTaskAction, StartupTaskInfo } from '@b-oss/b-ark-ui-components';
import { useApp } from '../context/AppContext.js';

export function StartupTaskBanner() {
  const { state, backend } = useApp();
  const wanted = state.store?.app.startWithWindows ?? false;
  const [info, setInfo] = useState<StartupTaskInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void backend
      .getStartupTask?.()
      .then(setInfo)
      .catch(() => setInfo({ state: 'unknown' }));
  }, [backend]);

  // On mount, whenever the setting changes, and when the window regains focus (the user may have
  // just fixed it in Windows Settings).
  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh, wanted]);

  const warning = describeStartupTask(info, wanted);
  if (!warning) return null;

  function onAction(action: StartupTaskAction): void {
    if (action === 'open_settings') {
      void backend.openStartupSettings?.();
      return;
    }
    setBusy(true);
    void backend
      .enableStartupTask?.()
      .then((next) => setInfo(next))
      .catch(() => refresh())
      .finally(() => setBusy(false));
  }

  return <StartupTaskBannerView warning={warning} busy={busy} onAction={onAction} />;
}
