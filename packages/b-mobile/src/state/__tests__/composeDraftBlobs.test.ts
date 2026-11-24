// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#1058: the draft store owns the blob URLs of the photos it holds (desktop: createObjectURL).
// A URL is revoked when no photo in the draft names it any more; file URIs / other paths never.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useComposeDraftStore, releasePhotos, type ComposeDraft } from '../composeDraftStore.js';

const ph = (webPath: string) => ({
  webPath,
  mimeType: 'image/jpeg',
  width: 1,
  height: 1,
  createdAt: null,
  sizeBytes: 1,
});
const base = (over: Partial<ComposeDraft> = {}): ComposeDraft => ({
  mode: 'publish',
  accountId: 'a1',
  photo: ph('blob:main'),
  title: '',
  tags: '',
  description: '',
  date: '2026-01-01',
  location: null,
  displayLocation: false,
  thumbnailCrop: null,
  extras: [ph('blob:x1'), ph('blob:x2')],
  dirty: false,
  ...over,
});
const s = () => useComposeDraftStore.getState();

let revoke: ReturnType<typeof vi.fn<(url: string) => void>>;
beforeEach(() => {
  revoke = vi.fn<(url: string) => void>();
  URL.revokeObjectURL = revoke;
  useComposeDraftStore.setState({ draft: null });
});
afterEach(() => vi.restoreAllMocks());

const revoked = () => revoke.mock.calls.map((c) => c[0]).sort();

describe('blob URL ownership (b-oss#1058)', () => {
  it('clearDraft revokes the photo and every extra', () => {
    s().setDraft(base());
    s().clearDraft();
    expect(revoked()).toEqual(['blob:main', 'blob:x1', 'blob:x2']);
  });

  it('replacing the photo revokes only the old one', () => {
    s().setDraft(base());
    s().patchDraft({ photo: ph('blob:new') });
    expect(revoked()).toEqual(['blob:main']);
  });

  it('removing an extra revokes only that one; keeping it revokes nothing', () => {
    s().setDraft(base());
    s().patchDraft({ title: 'x' });
    expect(revoked()).toEqual([]);
    s().patchDraft({ extras: [ph('blob:x1')] });
    expect(revoked()).toEqual(['blob:x2']);
  });

  it('a new draft replacing an old one revokes what the old one held', () => {
    s().setDraft(base());
    s().setDraft(base({ photo: ph('blob:other'), extras: [] }));
    expect(revoked()).toEqual(['blob:main', 'blob:x1', 'blob:x2']);
  });

  it('seeding an edit draft over another entry revokes the old one; over its own it does nothing', () => {
    s().setDraft(base({ mode: 'edit', entryId: 'e1', photo: null, extras: [ph('blob:x1')] }));
    expect(s().seedEditDraft(base({ mode: 'edit', entryId: 'e1', photo: null, extras: [] }))).toBe(
      false,
    );
    expect(revoked()).toEqual([]);
    s().seedEditDraft(base({ mode: 'edit', entryId: 'e2', photo: null, extras: [] }));
    expect(revoked()).toEqual(['blob:x1']);
  });

  it('leaves Android file URIs and web paths alone', () => {
    s().setDraft(
      base({
        photo: { ...ph('capacitor://localhost/_capacitor_file_/a.jpg'), uri: 'file:///a.jpg' },
        extras: [ph('https://example.test/x.jpg')],
      }),
    );
    s().clearDraft();
    expect(revoked()).toEqual([]);
  });

  it('clearDraftKeepingExtras revokes the photo but hands back the extras to release later', () => {
    s().setDraft(base());
    const kept = s().clearDraftKeepingExtras();
    expect(s().draft).toBeNull();
    expect(revoked()).toEqual(['blob:main']);
    releasePhotos(kept);
    expect(revoked()).toEqual(['blob:main', 'blob:x1', 'blob:x2']);
  });
});
