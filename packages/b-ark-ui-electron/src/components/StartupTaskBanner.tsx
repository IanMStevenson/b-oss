// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Container for the shared StartupTaskBanner. Only does anything where the main process reports a
// start-at-sign-in state (and Scheduled is on); elsewhere getStartupTask is absent or null.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StartupTaskBanner as StartupTaskBannerView,
  describeStartupTask,
} from '@b-oss/b-ark-ui-components';
import type { StartupTaskAction, StartupTaskInfo } from '@b-oss/b-ark-ui-components';
import { useApp } from '../context/AppContext.js';

export function StartupTaskBanner() {
  const { state, backend } = useApp();
  // Scheduled is the master setting and also decides start-at-sign-in.
  const wanted = state.store?.accounts[0]?.schedule.enabled ?? false;
  const [info, setInfo] = useState<StartupTaskInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void backend
      .getStartupTask?.()
      .then(setInfo)
      .catch(() => setInfo((prev) => (prev ? { ...prev, state: 'unknown' } : null)));
  }, [backend]);

  const warning = describeStartupTask(info, wanted);
  const warningShown = useRef(false);
  warningShown.current = warning !== null;

  // On mount and whenever the setting changes. On focus only while a warning is showing (the user
  // may have just fixed it in Windows Settings): otherwise every click would ask Windows again.
  useEffect(() => {
    refresh();
    const onFocus = (): void => {
      if (warningShown.current) refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, wanted]);

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
