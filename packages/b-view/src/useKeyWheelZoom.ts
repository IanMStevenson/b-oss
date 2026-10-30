// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Which zoom command a key press is, if any: Ctrl (or Cmd) with +, =, -, 0, including the numpad
 * (which reports the same `key` values). Alt/AltGr combinations are left alone. */
export function zoomKeyCommand(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): 'in' | 'out' | 'reset' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === '+' || e.key === '=') return 'in';
  if (e.key === '-' || e.key === '_') return 'out';
  if (e.key === '0') return 'reset';
  return null;
}

interface Options {
  enabled: boolean;
  /** Ctrl+wheel is listened for on this element. */
  target: RefObject<HTMLElement | null>;
  onZoom: (command: 'in' | 'out' | 'reset') => void;
  /** Handle Ctrl+wheel too (default). Off for a target whose own zoom library already does. */
  wheel?: boolean;
}

/** Ctrl+wheel over `target` and Ctrl +/-/0 anywhere on the page drive the host's own zoom. The
 * events are cancelled so a browser's page zoom does not also react: there is exactly one zoom.
 * Opt-in (`enabled`) because on a plain browser the user's own page zoom should keep working. */
export function useKeyWheelZoom({ enabled, target, onZoom, wheel = true }: Options): void {
  const handler = useRef(onZoom);
  useEffect(() => {
    handler.current = onZoom;
  });

  useEffect(() => {
    const el = target.current;
    if (!enabled || !el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || e.deltaY === 0) return;
      e.preventDefault();
      handler.current(e.deltaY < 0 ? 'in' : 'out');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      // A page kept mounted behind another (Ionic hides it with this class) must not react: its
      // grid would zoom while the photo on top is being zoomed.
      if (el.closest('.ion-page-hidden')) return;
      const command = zoomKeyCommand(e);
      if (!command) return;
      e.preventDefault();
      handler.current(command);
    };
    // Non-passive: a passive wheel listener cannot cancel the browser's page zoom.
    if (wheel) el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      if (wheel) el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, target, wheel]);
}
