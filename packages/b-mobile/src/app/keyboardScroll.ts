// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Keyboard scrolling for pages (b-oss#668). Ionic scrolls inside an `ion-content` element's own
// inner container rather than the document, and nothing there takes keyboard focus, so with a
// physical keyboard (desktop, a tablet with one) Up/Down/PageUp/PageDown/Home/End did nothing until
// the user happened to click into the content. This scrolls the visible page's content for those
// keys. It is input behaviour, not a platform check: a touch-only handheld never produces the
// keys. Left/Right are untouched (previous/next entry stays with the entry page's own handler).

const LINE_PX = 48;
const PAGE_FRACTION = 0.875;

// Controls that use these keys themselves, or a map that pans with them.
const OWN_KEYS_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="slider"]',
  '[role="listbox"]',
  '[role="combobox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menu"]',
  '[role="menuitem"]',
  'ion-input',
  'ion-textarea',
  'ion-searchbar',
  'ion-range',
  'ion-segment',
  'ion-select',
  'ion-datetime',
  'ion-action-sheet',
  'ion-alert',
  'ion-popover',
  'ion-picker',
  '.maplibregl-map',
  '.leaflet-container',
].join(',');

/** The `ion-content` the user is looking at: the last one in the DOM that is not on a hidden page
 * (an open modal's content comes after the page beneath it). */
export function visibleContent(root: ParentNode = document): HTMLIonContentElement | null {
  const all = Array.from(root.querySelectorAll<HTMLIonContentElement>('ion-content'));
  const shown = all.filter((el) => !el.closest('.ion-page-hidden'));
  return shown.length ? shown[shown.length - 1] : null;
}

/** The change a key makes to scrollTop, or null if it isn't a scroll key. */
export function scrollTarget(
  key: string,
  top: number,
  clientHeight: number,
  scrollHeight: number,
): number | null {
  const max = Math.max(0, scrollHeight - clientHeight);
  const page = Math.round(clientHeight * PAGE_FRACTION);
  switch (key) {
    case 'ArrowDown':
      return Math.min(max, top + LINE_PX);
    case 'ArrowUp':
      return Math.max(0, top - LINE_PX);
    case 'PageDown':
      return Math.min(max, top + page);
    case 'PageUp':
      return Math.max(0, top - page);
    case 'Home':
      return 0;
    case 'End':
      return max;
    default:
      return null;
  }
}

/** True when the key came from a control that uses the keys itself (a text field, slider, map…). */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  const origin = (path[0] ?? e.target) as Element | null;
  return origin instanceof Element && origin.closest(OWN_KEYS_SELECTOR) !== null;
}

/** The back control of the page the user is looking at, if it is actually showing. */
export function visibleBackButton(root: ParentNode = document): HTMLElement | null {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.ion-page')).filter(
    (el) => !el.closest('.ion-page-hidden') && el.querySelector('ion-content'),
  );
  const page = pages[pages.length - 1];
  const btn = page?.querySelector<HTMLElement>('ion-back-button');
  if (!btn || btn.hidden || btn.classList.contains('ion-hide')) return null;
  return btn.getClientRects().length > 0 ? btn : null;
}

/** Backspace = Back, when a back control is showing (as the browser's own Backspace used to). */
export function handleBackKey(e: KeyboardEvent): void {
  if (e.key !== 'Backspace' || e.defaultPrevented) return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (isTypingTarget(e)) return;
  // An open sheet/dialog owns the keyboard; the page beneath it isn't what Back would close.
  if (document.querySelector('ion-modal:not(.overlay-hidden), ion-popover:not(.overlay-hidden)'))
    return;
  const btn = visibleBackButton();
  if (!btn) return;
  e.preventDefault();
  btn.click();
}

export function handleScrollKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (isTypingTarget(e)) return;
  const content = visibleContent();
  if (!content) return;
  void content.getScrollElement().then((el) => {
    const next = scrollTarget(e.key, el.scrollTop, el.clientHeight, el.scrollHeight);
    if (next === null) return;
    el.scrollTop = next;
  });
  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) {
    // Stop the browser also scrolling something itself (it would double up once content has focus).
    e.preventDefault();
  }
}

export function installKeyboardScroll(): () => void {
  window.addEventListener('keydown', handleScrollKey);
  window.addEventListener('keydown', handleBackKey);
  return () => {
    window.removeEventListener('keydown', handleScrollKey);
    window.removeEventListener('keydown', handleBackKey);
  };
}
