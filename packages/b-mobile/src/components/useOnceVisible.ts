// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// True from the first time the element scrolls into view, so a long list can defer per-row
// lookups until the row is actually on screen (b-oss#1027). Where IntersectionObserver is missing
// (jsdom, very old WebViews) it reports visible straight away, so nothing is ever left waiting.

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useOnceVisible(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, visible]);
  return visible;
}
