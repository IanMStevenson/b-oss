// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Whether the window is wide enough for the two-column entry form (b-oss#1043): the website's own
// layout, with the calendar open. Width only (no pointer test), so a tablet gets it too; a phone,
// and a narrow desktop window, get the single column with the calendar folded away. The same
// breakpoint as styles/wide.css and ComposeForm.css's .entry-form rules.

import { useEffect, useState } from 'react';

export const WIDE_FORM_QUERY = '(min-width: 900px)';

function matches(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(WIDE_FORM_QUERY).matches;
}

/** True while the window is wide enough for the two-column entry form. Live. */
export function useWideForm(): boolean {
  const [wide, setWide] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(WIDE_FORM_QUERY);
    const onChange = (): void => setWide(query.matches);
    query.addEventListener('change', onChange);
    onChange();
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}
