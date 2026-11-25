// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Which moves take the member away from an unsaved draft (b-oss#1059). Pure, so the one guard in
// app/routes/DraftNavigationGuard.tsx stays a thin wrapper and the rules are tested on their own.
// A move to one of the draft's own screens (the form, its photo and location screens) is the draft
// being used, not left.

import type { ComposeDraft } from './composeDraftStore.js';

function pathOf(to: string): string {
  const path = to.split(/[?#]/)[0] ?? '';
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** The screen the draft's form lives on: Back from here leaves the draft. */
function mainScreen(draft: ComposeDraft): string {
  return draft.mode === 'edit' ? `/entry/${draft.entryId ?? ''}/edit` : '/compose/details';
}

function ownScreens(draft: ComposeDraft): string[] {
  const shared = ['/compose/location', '/compose/description'];
  return draft.mode === 'edit'
    ? [mainScreen(draft), `${mainScreen(draft)}/photo`, ...shared]
    : [mainScreen(draft), ...shared];
}

/** True when going to `to` (a path, optionally with a query) would take the member away from a
 * draft that has unsaved changes. */
export function navigationLeavesDraft(draft: ComposeDraft | null, to: string): boolean {
  if (!draft?.dirty) return false;
  return !ownScreens(draft).includes(pathOf(to));
}

/** True when going back (the system Back, history -1) from `fromPath` leaves an unsaved draft: only
 * from the form itself; from its photo or location screen, Back returns to the form. */
export function backLeavesDraft(draft: ComposeDraft | null, fromPath: string): boolean {
  if (!draft?.dirty) return false;
  return pathOf(fromPath) === mainScreen(draft);
}
