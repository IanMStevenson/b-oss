// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Remembers an `IonContent`'s scroll position and puts it back when the screen is rebuilt — the
// scrolling-list half of "Back returns you to where you were" (b-oss#190; the paged grids are
// handled by usePagedResource / EntryGrid's resumeKey). Backed by data/resumeCache.ts, so the same
// rules apply: in memory, expires after ten minutes, gone on restart.
//
// Usage:  const scroll = useScrollResume(`entry:${id}`, entryLoaded);   <IonContent {...scroll}>
// `ready` must flip true only once the content that gives the scroll its height has rendered —
// restoring into a still-empty page would just clamp to 0 and then be forgotten.

import { useCallback, useEffect, useRef } from 'react';
import type { ScrollDetail } from '@ionic/core';
import { resumeGet, resumeSet } from './resumeCache.js';

const scrollKey = (key: string) => `${key}:scroll`;

export function useScrollResume(key: string | undefined, ready: boolean) {
  const ref = useRef<HTMLIonContentElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    if (!key || !ready || restored.current) return;
    restored.current = true;
    const y = resumeGet<number>(scrollKey(key));
    if (!y) return;
    // After this render's layout has settled, so the content is tall enough to scroll to `y`.
    requestAnimationFrame(() => {
      void ref.current?.scrollToPoint?.(0, y, 0);
    });
  }, [key, ready]);

  const onIonScroll = useCallback(
    (event: CustomEvent<ScrollDetail>) => {
      // Not before the saved position has been restored: the initial scroll-to-top event would
      // otherwise overwrite what we're about to read back.
      if (!key || !restored.current) return;
      resumeSet(scrollKey(key), event.detail.scrollTop);
    },
    [key],
  );

  // `scrollEvents` is what makes IonContent emit ionScroll at all.
  return { ref, scrollEvents: true, onIonScroll };
}
