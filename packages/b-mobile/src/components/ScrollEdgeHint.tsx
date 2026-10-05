// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A scrollable Ionic segment (Browse's tab strip) gives no sign there are more tabs off-screen.
// This wraps it and fades the toolbar colour over whichever edge still has hidden content, with a
// small chevron, so a clipped tab reads as "keep scrolling" (b-oss#216). Purely visual: the overlays
// ignore pointer events, and they disappear when nothing is clipped on that side.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const THRESHOLD = 2; // px of slack so sub-pixel rounding doesn't leave a phantom hint

export function ScrollEdgeHint({ children }: { children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const scroller = wrapper.current?.querySelector('ion-segment');
    if (!scroller) return;
    const update = () => {
      const max = scroller.scrollWidth - scroller.clientWidth;
      setEdges({
        left: scroller.scrollLeft > THRESHOLD,
        right: scroller.scrollLeft < max - THRESHOLD,
      });
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    // Tabs appear/disappear (sign-in changes) without the segment itself resizing.
    const mutations = new MutationObserver(update);
    mutations.observe(scroller, { childList: true });
    return () => {
      scroller.removeEventListener('scroll', update);
      observer?.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <div ref={wrapper} style={{ position: 'relative' }}>
      {children}
      <Fade side="left" show={edges.left} />
      <Fade side="right" show={edges.right} />
    </div>
  );
}

function Fade({ side, show }: { side: 'left' | 'right'; show: boolean }) {
  if (!show) return null;
  const Chevron = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <div
      data-testid={`scroll-hint-${side}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: 0,
        width: 32,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        color: 'var(--muted, #6b7280)',
        background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, var(--ion-toolbar-background, #fff) 35%, transparent)`,
      }}
    >
      <Chevron size={18} strokeWidth={2} />
    </div>
  );
}
