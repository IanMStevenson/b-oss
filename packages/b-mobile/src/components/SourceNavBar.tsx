// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The bottom bar on the entry screen that steps through the grid the entry was opened from
// (b-oss#819; behaviour in BEHAVIOUR.md). Left arrow = further along the grid's reading order,
// right arrow = back towards the first item, so on a newest-first feed it reads like the journal's
// own timeline (older on the left). Swiping the bar does the same, mirrored like the page swipe
// (swipe left = what the right arrow does). Tapping the caption opens a small sheet saying where you
// came from, with Hide / Turn off in Settings and a close (X) at the top right. The region carries `data-no-swipe` so b-view's page swipe, which
// would otherwise move through the journal, ignores touches that start here.

import { useRef, useState, type TouchEvent } from 'react';
import { IonButton, IonModal, IonSpinner } from '@ionic/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAppNavigate } from '../app/routes/useAppNavigate.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import { sourceNavReach, useSourceNavStore } from '../state/sourceNavStore.js';

const SWIPE_THRESHOLD_PX = 48;

export function SourceNavBar() {
  const anchor = useSourceNavStore((s) => s.anchor);
  const loading = useSourceNavStore((s) => s.loading);
  const navigate = useAppNavigate();
  const setShowSourceNavBar = useDevicePrefsStore((s) => s.setShowSourceNavBar);
  const [sheetOpen, setSheetOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  if (!anchor) return null;
  const reach = sourceNavReach(anchor);

  async function go(direction: 1 | -1): Promise<void> {
    const id = await useSourceNavStore.getState().step(direction);
    if (id) navigate.replace(`/entry/${id}`);
  }

  function onTouchStart(e: TouchEvent): void {
    const t = e.touches.length === 1 ? e.touches[0] : undefined;
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  }

  function onTouchEnd(e: TouchEvent): void {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
    // Swipe left = the right arrow (back); swipe right = the left arrow (further).
    if (dx < 0 && reach.back) void go(-1);
    if (dx > 0 && reach.further) void go(1);
  }

  return (
    <>
      <div
        className="source-nav-bar"
        data-no-swipe
        data-testid="source-nav-bar"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          className="source-nav-arrow"
          aria-label="Next in list"
          disabled={!reach.further || loading}
          onClick={() => void go(1)}
        >
          <ChevronLeft size={26} />
        </button>
        <button
          type="button"
          className="source-nav-caption"
          aria-label={`Navigating: ${anchor.source.label}. Options`}
          onClick={() => setSheetOpen(true)}
        >
          <span className="source-nav-label">Navigating: {anchor.source.label}</span>
          {loading && <IonSpinner name="dots" />}
        </button>
        <button
          type="button"
          className="source-nav-arrow"
          aria-label="Previous in list"
          disabled={!reach.back || loading}
          onClick={() => void go(-1)}
        >
          <ChevronRight size={26} />
        </button>
      </div>
      <IonModal
        isOpen={sheetOpen}
        className="source-nav-sheet"
        breakpoints={[0, 0.3]}
        initialBreakpoint={0.3}
        handle={false}
        onDidDismiss={() => setSheetOpen(false)}
      >
        <div className="source-nav-sheet-body">
          <button
            type="button"
            className="source-nav-sheet-close"
            aria-label="Close"
            onClick={() => setSheetOpen(false)}
          >
            <X size={22} />
          </button>
          <p className="source-nav-sheet-title">Navigating: {anchor.source.detail}</p>
          <IonButton
            expand="block"
            onClick={() => {
              setSheetOpen(false);
              useSourceNavStore.getState().clear();
            }}
          >
            Hide navigation bar
          </IonButton>
          <IonButton
            expand="block"
            fill="outline"
            onClick={() => {
              setSheetOpen(false);
              setShowSourceNavBar(false);
              useSourceNavStore.getState().clear();
            }}
          >
            Turn off in Settings
          </IonButton>
        </div>
      </IonModal>
    </>
  );
}
