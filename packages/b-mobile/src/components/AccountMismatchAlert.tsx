// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The "wrong Blipfoto account" alert (b-oss#240), shared by every place a token change for an
// existing account can be started: SCR-01's second (notifications) sign-in, SCR-25's
// notification toggles, and SCR-30's Sign in again / mode change. By the time this shows, the
// flow has already revoked the stray token and stored nothing; this only explains what happened
// and offers to retry in the clean in-app browser (cookies cleared, so it can't reuse whoever the
// system browser is signed in as). The retry itself is the caller's: it knows what it was doing.

import { useEffect, useRef } from 'react';
import { IonAlert } from '@ionic/react';
import { AccountMismatchError } from '../flows/accountMismatch.js';
import { isNativePlatform } from '../platform/appState.js';
import { t } from '../strings/index.js';

/** Whether retrying in the in-app browser could help. It only exists on native, and it only helps
 * if the token came from a sign-in round: a known wrong owner always did, while b-push's 403
 * (owner unknown) on a read-only account was about the app token itself, which no new round of
 * the notifications flow would replace. */
export function canRetryInApp(
  err: AccountMismatchError,
  scope: 'read' | 'read,write' | null,
): boolean {
  return isNativePlatform() && (err.actual !== null || scope === 'read,write');
}

export function accountMismatchMessage(err: AccountMismatchError, canRetry: boolean): string {
  const vars = { expected: err.expected, actual: err.actual ?? '' };
  const body =
    err.actual === null
      ? t('AUTH.account_mismatch.body.unknown', vars)
      : err.inApp
        ? t('AUTH.account_mismatch.body.in_app', vars)
        : t('AUTH.account_mismatch.body.browser', vars);
  return canRetry ? `${body} ${t('AUTH.account_mismatch.retry_hint')}` : body;
}

/** Open while `error` is non-null. `onClose(true)` means "retry in the app", `onClose(false)` is
 * Not now / OK; it's called exactly once per error shown. */
export function AccountMismatchAlert({
  error,
  canRetry,
  onClose,
}: {
  error: AccountMismatchError | null;
  canRetry: boolean;
  onClose: (retry: boolean) => void;
}) {
  const closed = useRef(false);
  useEffect(() => {
    closed.current = false;
  }, [error]);

  function close(retry: boolean): void {
    if (closed.current) return;
    closed.current = true;
    onClose(retry);
  }

  const buttons = canRetry
    ? [
        {
          text: t('AUTH.account_mismatch.button_dismiss'),
          role: 'cancel',
          handler: () => close(false),
        },
        { text: t('AUTH.account_mismatch.button_retry'), handler: () => close(true) },
      ]
    : [{ text: t('AUTH.account_mismatch.button_ok'), role: 'cancel', handler: () => close(false) }];

  return (
    <IonAlert
      isOpen={error !== null}
      header={t('AUTH.account_mismatch.title')}
      message={error ? accountMismatchMessage(error, canRetry) : undefined}
      backdropDismiss={false}
      onDidDismiss={() => close(false)}
      buttons={buttons}
    />
  );
}
