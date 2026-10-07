// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// "One more sign-in" (b-oss#165, #240): shown right before the second, read-only Blipfoto
// sign-in that notifications need on a read-write account, so it doesn't appear out of nowhere and
// look like the first one failed. SCR-01 shows it mid-sign-in ([Skip notifications] [Sign in
// again]); SCR-25 shows it when the first notification toggle goes on ([Cancel] [Continue]).
// Both hand `ask` to the flow as its `beforeServiceRound` hook (flows/accountsFlow.ts).

import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { IonAlert } from '@ionic/react';
import { t } from '../strings/index.js';

export function useServiceRoundExplainer(buttons: { cancel: string; proceed: string }): {
  /** Shows the explainer; resolves true to go ahead with the second sign-in, false to skip it. */
  ask: () => Promise<boolean>;
  element: ReactElement;
} {
  const resolver = useRef<((proceed: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);

  const answer = useCallback((proceed: boolean) => {
    resolver.current?.(proceed);
    resolver.current = null;
    setOpen(false);
  }, []);

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const element = (
    <IonAlert
      isOpen={open}
      header={t('FLW22.notifications_on.title')}
      message={t('FLW22.notifications_on.body')}
      backdropDismiss={false}
      onDidDismiss={() => answer(false)}
      buttons={[
        { text: buttons.cancel, role: 'cancel', handler: () => answer(false) },
        { text: buttons.proceed, handler: () => answer(true) },
      ]}
    />
  );

  return { ask, element };
}
