// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron container for the shared AuthErrorBanner: binds the reauthorise
// action (with toast feedback) and forwards the ref used by HomeScreen to
// scroll/flash the banner; presentation lives in the kit.
import { forwardRef } from 'react';
import { AuthErrorBanner as AuthErrorBannerView } from '@b-oss/b-ark-ui-components';
import type { AccountConfig } from '../backend.js';
import { useApp } from '../context/AppContext.js';
import { useToast } from '../hooks/useToast.js';
import { addAccountWithToast } from '../lib/add-account-with-toast.js';

interface Props {
  account: AccountConfig;
  highlighted: boolean;
}

export const AuthErrorBanner = forwardRef<HTMLDivElement, Props>(function AuthErrorBanner(
  { account, highlighted },
  ref,
) {
  const { backend } = useApp();
  const showToast = useToast();

  return (
    <AuthErrorBannerView
      ref={ref}
      errorMessage={account.error_message}
      highlighted={highlighted}
      onReauthorise={() =>
        void addAccountWithToast(() => backend.reauthoriseAccount(account.id), showToast)
      }
    />
  );
});
