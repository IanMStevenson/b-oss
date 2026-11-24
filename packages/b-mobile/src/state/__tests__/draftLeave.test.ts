// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { backLeavesDraft, navigationLeavesDraft } from '../draftLeave.js';
import type { ComposeDraft } from '../composeDraftStore.js';

const base: ComposeDraft = {
  mode: 'publish',
  accountId: 'a1',
  photo: null,
  title: '',
  tags: '',
  description: '',
  date: '2026-01-01',
  location: null,
  displayLocation: false,
  thumbnailCrop: null,
  dirty: true,
};
const publish = base;
const edit: ComposeDraft = { ...base, mode: 'edit', entryId: 'e1' };

describe('navigationLeavesDraft (b-oss#1059)', () => {
  it('no draft, or a clean one: nothing is left', () => {
    expect(navigationLeavesDraft(null, '/browse')).toBe(false);
    expect(navigationLeavesDraft({ ...publish, dirty: false }, '/browse')).toBe(false);
  });

  it.each(['/browse', '/settings', '/entry/x1', '/user/bob', '/notifications', '/compose'])(
    'a dirty new entry is left by %s',
    (to) => expect(navigationLeavesDraft(publish, to)).toBe(true),
  );

  it.each([
    '/compose/details',
    '/compose/location',
    '/compose/description',
    '/compose/details?x=1',
  ])("a dirty new entry's own screen %s is not leaving", (to) =>
    expect(navigationLeavesDraft(publish, to)).toBe(false),
  );

  it.each(['/browse', '/entry/e1', '/entry/e2/edit', '/compose/details', '/compose'])(
    'a dirty edit of e1 is left by %s',
    (to) => expect(navigationLeavesDraft(edit, to)).toBe(true),
  );

  it.each(['/entry/e1/edit', '/entry/e1/edit/photo', '/compose/location', '/compose/description'])(
    "a dirty edit of e1's own screen %s is not leaving",
    (to) => expect(navigationLeavesDraft(edit, to)).toBe(false),
  );
});

describe('backLeavesDraft (b-oss#1059)', () => {
  it('Back from the draft’s main screen leaves; from a side screen it stays in the flow', () => {
    expect(backLeavesDraft(publish, '/compose/details')).toBe(true);
    expect(backLeavesDraft(edit, '/entry/e1/edit')).toBe(true);
    for (const from of ['/compose/location', '/compose/description', '/entry/e1/edit/photo']) {
      expect(backLeavesDraft(from.includes('entry') ? edit : publish, from)).toBe(false);
    }
  });
  it('no draft or a clean draft: Back leaves nothing', () => {
    expect(backLeavesDraft(null, '/compose/details')).toBe(false);
    expect(backLeavesDraft({ ...publish, dirty: false }, '/compose/details')).toBe(false);
  });
});
