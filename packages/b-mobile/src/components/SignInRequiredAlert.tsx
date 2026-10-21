// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// "You must be signed in to do this" (FLW-01, b-oss#397): what a signed-out user sees instead of
// being dropped straight into a Blipfoto sign-in. Sign in now goes to the normal sign-in screen
// (SCR-01, with its browser/mode/notifications choices); Cancel leaves things as they were. Shared
// by the screens' gated actions (app/routes/useSignInPrompt.tsx) and the route guards, which each
// decide what Cancel means for them.

import { useEffect, useRef } from 'react';
import { IonAlert } from '@ionic/react';
import { t } from '../strings/index.js';

export function SignInRequiredAlert({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  /** Called once per showing: `true` for Sign in now, `false` for Cancel or any other dismiss. */
  onClose: (signIn: boolean) => void;
}) {
  const closed = useRef(false);
  useEffect(() => {
    if (isOpen) closed.current = false;
  }, [isOpen]);

  function close(signIn: boolean): void {
    if (closed.current) return;
    closed.current = true;
    onClose(signIn);
  }

  return (
    <IonAlert
      isOpen={isOpen}
      header={t('SIGN_IN_REQUIRED.title')}
      backdropDismiss={false}
      onDidDismiss={() => close(false)}
      buttons={[
        { text: t('SIGN_IN_REQUIRED.button.cancel'), role: 'cancel', handler: () => close(false) },
        { text: t('SIGN_IN_REQUIRED.button.sign_in'), handler: () => close(true) },
      ]}
    />
  );
}
