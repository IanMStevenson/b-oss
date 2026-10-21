// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The gated-action half of FLW-01 (b-oss#397): a screen action that needs an account (Star,
// Favourite, Comment, Follow) calls `prompt()` when signed out and renders `element`. Sign in now
// replaces the current screen with `/sign-in?return=<this screen>`, so a successful sign-in comes
// straight back here with no duplicate history entry; Cancel does nothing. The action itself is
// not replayed: the user lands back where they were and taps it again, now signed in. Lives in
// app/routes because it reads the current location (§5: only this directory touches the router).

import { useState } from 'react';
import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { SignInRequiredAlert } from '../../components/SignInRequiredAlert.js';
import { useAppNavigate } from './useAppNavigate.js';
import { signInPathFor } from './signInReturn.js';

export function useSignInPrompt(): { prompt: () => void; element: ReactElement } {
  const { pathname, search } = useLocation();
  const navigate = useAppNavigate();
  const [open, setOpen] = useState(false);

  const element = (
    <SignInRequiredAlert
      isOpen={open}
      onClose={(signIn) => {
        setOpen(false);
        if (signIn) navigate.replace(signInPathFor(pathname + search));
      }}
    />
  );

  return { prompt: () => setOpen(true), element };
}
