// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Control density follows the input device, not the platform (b-oss#637, b-oss#633): the root
// attribute `data-pointer` is `fine` when the primary pointer is precise (a mouse or trackpad) and
// `coarse` otherwise (touch). b-visual's tokens.css makes the density tokens compact under
// `[data-pointer='fine']`. It is live: attaching or removing a mouse changes the media query and
// the attribute with it. A tablet with a mouse is therefore compact; a phone or touch tablet never.

export type PointerKind = 'fine' | 'coarse';

const FINE_QUERY = '(pointer: fine)';

export function pointerKind(fine: boolean): PointerKind {
  return fine ? 'fine' : 'coarse';
}

/** Sets `data-pointer` on <html> from the media query and keeps it current. Returns a function that
 * stops listening. Without matchMedia (none expected in a WebView) it stays `coarse`. */
export function initPointerDensity(root: HTMLElement = document.documentElement): () => void {
  if (typeof window.matchMedia !== 'function') {
    root.dataset.pointer = 'coarse';
    return () => {};
  }
  const query = window.matchMedia(FINE_QUERY);
  const apply = (fine: boolean): void => {
    root.dataset.pointer = pointerKind(fine);
  };
  apply(query.matches);
  const onChange = (e: MediaQueryListEvent): void => apply(e.matches);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
