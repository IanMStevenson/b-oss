// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Brings the open reply composer into view. A reply started from the comments inbox lands on the
// entry page with its composer already open far down a long comment list, so without this the page
// sits at the top (b-oss#317). Runs when a reply target opens: after layout settles it centres the
// composer's form in the scroll area (focus is the composer's own `autoFocus`), then once more
// when the soft keyboard's resize arrives, since opening the keyboard shrinks the viewport and
// moves the composer. The scroll margins keep it clear of the notch and gesture bar.

import { useEffect } from 'react';
import type { RefObject } from 'react';

/** How long after opening a viewport resize (the keyboard sliding up) still re-centres. */
const KEYBOARD_SETTLE_MS = 1200;

export function revealReplyComposer(root: ParentNode | null): void {
  const field = root?.querySelector<HTMLElement>('[aria-label^="Reply to "]');
  const form = field?.closest<HTMLElement>('form') ?? field;
  if (!form) return;
  form.style.scrollMarginTop = 'calc(env(safe-area-inset-top, 0px) + 56px)';
  form.style.scrollMarginBottom = 'calc(env(safe-area-inset-bottom, 0px) + 16px)';
  form.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

/** `replyViewId` is the open reply composer's comment id, or null/undefined when none is open. */
export function useRevealReplyComposer(
  contentRef: RefObject<HTMLElement | null>,
  replyViewId: string | null | undefined,
): void {
  useEffect(() => {
    if (!replyViewId) return;
    const reveal = () => revealReplyComposer(contentRef.current);
    const frame = requestAnimationFrame(reveal);
    const viewport = window.visualViewport;
    const onResize = () => reveal();
    viewport?.addEventListener('resize', onResize);
    window.addEventListener('resize', onResize);
    const stop = window.setTimeout(() => {
      viewport?.removeEventListener('resize', onResize);
      window.removeEventListener('resize', onResize);
    }, KEYBOARD_SETTLE_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(stop);
      viewport?.removeEventListener('resize', onResize);
      window.removeEventListener('resize', onResize);
    };
  }, [contentRef, replyViewId]);
}
