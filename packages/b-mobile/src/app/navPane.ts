// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Whether the navigation menu sits beside the page (an Ionic split pane) or is the usual drawer
// (b-oss#638, b-oss#633). Layout, so it follows the window width and the route live; the profile
// only says whether this behaviour exists at all (`nav.split`), and the user's pin overrides the
// screen rule in either direction.

import { useEffect, useState } from 'react';
import { profile } from '../profile/profile.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';

/** Windows at least this wide (CSS px) can hold the menu beside the page. One place for it. */
export const NAV_PANE_MIN_WIDTH = 992;

/** The screens where the photo needs the room, so the menu auto-collapses: Browse and the Entry
 * page (and its full-screen photo). Edit and report forms under /entry/... are ordinary screens. */
export function isImmersiveRoute(pathname: string): boolean {
  return /^\/browse\/?$/.test(pathname) || /^\/entry\/[^/]+\/?(photo\/?)?$/.test(pathname);
}

export interface NavPaneInput {
  split: 'auto' | 'off';
  wide: boolean;
  immersive: boolean;
  pinned: 'auto' | boolean;
}

/** True when the menu should be shown beside the page. */
export function navPaneOpen({ split, wide, immersive, pinned }: NavPaneInput): boolean {
  if (split === 'off' || !wide) return false;
  if (pinned === 'auto') return !immersive;
  return pinned;
}

/** What the pin button stores when pressed: the opposite of what is showing, except that going back
 * to what the screen rule would do anyway is stored as 'auto' (so the pin does not stick for ever). */
export function nextNavPin(input: NavPaneInput): 'auto' | boolean {
  const wanted = !navPaneOpen(input);
  const byRule = navPaneOpen({ ...input, pinned: 'auto' });
  return wanted === byRule ? 'auto' : wanted;
}

/** Live `(min-width)` match; a window resize changes it. */
function useWide(): boolean {
  const query = `(min-width: ${NAV_PANE_MIN_WIDTH}px)`;
  const read = (): boolean =>
    typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent): void => setWide(e.matches);
    setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return wide;
}

export interface NavPane {
  /** Whether the profile has the beside-the-page menu at all (handheld: no). */
  enabled: boolean;
  /** The window is wide enough that a pin means something. */
  wide: boolean;
  open: boolean;
  /** Press of the pin button. */
  togglePin: () => void;
}

export function useNavPane(pathname: string): NavPane {
  const split = profile().nav.split;
  const wide = useWide();
  const pinned = useDevicePrefsStore((s) => s.navPinned);
  const setNavPinned = useDevicePrefsStore((s) => s.setNavPinned);
  const input: NavPaneInput = { split, wide, immersive: isImmersiveRoute(pathname), pinned };
  return {
    enabled: split === 'auto',
    wide,
    open: navPaneOpen(input),
    togglePin: () => setNavPinned(nextNavPin(input)),
  };
}
