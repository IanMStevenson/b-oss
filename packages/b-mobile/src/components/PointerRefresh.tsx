// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A refresh button in the header for devices with a mouse or trackpad (b-oss#719). IonRefresher
// needs a touch drag, so a mouse user had no way to refresh. Rendered next to each IonRefresher
// with the same handler; on a `(pointer: fine)` device it portals a button into the
// `.app-header-refresh-slot` that AppHeader leaves in its end buttons. On touch it renders nothing
// and pull-to-refresh stays. Live: attaching a mouse to a tablet shows it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonButton } from '@ionic/react';
import { RefreshCw } from 'lucide-react';

const FINE_QUERY = '(pointer: fine)';

export function useFinePointer(): boolean {
  const [fine, setFine] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(FINE_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(FINE_QUERY);
    const onChange = (e: MediaQueryListEvent): void => setFine(e.matches);
    setFine(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return fine;
}

interface PointerRefreshProps {
  onRefresh: () => void;
}

export function PointerRefresh({ onRefresh }: PointerRefreshProps) {
  const fine = useFinePointer();
  const anchor = useRef<HTMLSpanElement>(null);
  const [slot, setSlot] = useState<Element | null>(null);

  useLayoutEffect(() => {
    if (!fine) {
      setSlot(null);
      return;
    }
    setSlot(anchor.current?.closest('ion-page')?.querySelector('.app-header-refresh-slot') ?? null);
  }, [fine]);

  return (
    <>
      <span ref={anchor} hidden />
      {slot &&
        createPortal(
          <IonButton aria-label="Refresh" title="Refresh" onClick={onRefresh}>
            <RefreshCw slot="icon-only" size={20} strokeWidth={1.8} />
          </IonButton>,
          slot,
        )}
    </>
  );
}
