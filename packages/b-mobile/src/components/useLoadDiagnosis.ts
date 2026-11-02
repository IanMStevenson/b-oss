// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What a failed load should say (b-oss#539, b-oss#754). A transport failure is either the phone
// being offline or Blipfoto not answering, so it asks platform/connectivity.ts which; any other
// failure (an HTTP or API error — we did reach Blipfoto) shows the error's own message. Shared by
// the full-pane LoadFailed and the compact LoadFailedBanner.

import { useEffect, useState } from 'react';
import { isOnline } from '../platform/connectivity.js';

export type Diagnosis = 'checking' | 'offline' | 'blipfoto' | 'other';

export interface LoadDiagnosis {
  diagnosis: Diagnosis;
  title: string;
  hint: string;
}

export function useLoadDiagnosis(transport: boolean, message?: string): LoadDiagnosis {
  const [diagnosis, setDiagnosis] = useState<Diagnosis>(transport ? 'checking' : 'other');

  useEffect(() => {
    if (!transport) {
      setDiagnosis('other');
      return;
    }
    setDiagnosis('checking');
    let cancelled = false;
    void isOnline().then((online) => {
      if (!cancelled) setDiagnosis(online ? 'blipfoto' : 'offline');
    });
    return () => {
      cancelled = true;
    };
  }, [transport]);

  const title = {
    checking: 'Couldn’t load',
    offline: 'You seem to be offline',
    blipfoto: 'Can’t reach Blipfoto',
    other: 'Couldn’t load',
  }[diagnosis];
  const hint = {
    checking: 'Checking your connection…',
    offline: 'Check your connection.',
    blipfoto: 'Your connection looks fine, but Blipfoto isn’t answering.',
    other: message ?? 'Something went wrong.',
  }[diagnosis];
  return { diagnosis, title, hint };
}
