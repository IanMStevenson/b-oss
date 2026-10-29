// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The "couldn't load" state for a browse pane (b-oss#539). A transport failure is either the phone
// being offline or Blipfoto not answering, so it asks platform/connectivity.ts which; any other
// failure (an HTTP or API error — we did reach Blipfoto) shows the error's own message. All three
// say that swiping down checks again, and the pane carries its own refresher for that since the
// EntryGrid one isn't mounted while the load is in error. A "Try again" button stays for anyone who
// can't swipe. When Blipfoto itself isn't answering it also links to the unofficial status page
// (b-oss#488).

import { useEffect, useState } from 'react';
import { IonButton, IonRefresher, IonRefresherContent, IonSpinner } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { CloudOff, WifiOff } from 'lucide-react';
import { isOnline } from '../platform/connectivity.js';
import { openUrl } from '../platform/browser.js';
import { BLIPFOTO_STATUS_URL } from '../statusLink.js';

interface LoadFailedProps {
  /** The failure was at the transport level (no response at all), so connectivity is worth asking. */
  transport: boolean;
  /** The error's own text, shown when the failure wasn't a transport one. */
  message?: string;
  onRefresh: () => void;
}

type Diagnosis = 'checking' | 'offline' | 'blipfoto' | 'other';

export function LoadFailed({ transport, message, onRefresh }: LoadFailedProps) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis>(transport ? 'checking' : 'other');

  useEffect(() => {
    if (!transport) return;
    let cancelled = false;
    void isOnline().then((online) => {
      if (!cancelled) setDiagnosis(online ? 'blipfoto' : 'offline');
    });
    return () => {
      cancelled = true;
    };
  }, [transport]);

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    onRefresh();
    event.detail.complete();
  }

  const offline = diagnosis === 'offline';
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

  return (
    <>
      <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
        <IonRefresherContent />
      </IonRefresher>
      <div className="empty-state load-failed" role="alert">
        <div className="empty-state-icon" aria-hidden="true">
          {diagnosis === 'checking' ? (
            <IonSpinner />
          ) : offline ? (
            <WifiOff size={40} strokeWidth={1.5} />
          ) : (
            <CloudOff size={40} strokeWidth={1.5} />
          )}
        </div>
        <p className="empty-state-title">{title}</p>
        <p className="empty-state-hint">{hint}</p>
        <p className="empty-state-hint">Swipe down or tap below to try again.</p>
        <IonButton fill="outline" size="small" onClick={onRefresh} className="load-failed-retry">
          Try again
        </IonButton>
        {diagnosis === 'blipfoto' && (
          <IonButton
            fill="clear"
            size="small"
            onClick={() => void openUrl(BLIPFOTO_STATUS_URL)}
            className="load-failed-status"
          >
            Is Blipfoto down? Check the unofficial status page
          </IonButton>
        )}
      </div>
    </>
  );
}
