// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The compose draft (app-architecture.md §6, "Draft state"). Survives navigation from SCR-10 to
// SCR-11/SCR-12 and back, and rotation — held here rather than in SCR-10's own component state,
// since SCR-11/SCR-12 write their results directly into it and it must outlive SCR-10 itself
// being (conceptually) mid-navigation. Not persisted to prefs: a Capacitor WebView's JS context
// survives rotation/resize without a reload, so in-memory is enough, and a draft has no business
// surviving an app restart (the discard guard is about leaving the screen, not about resuming
// after the process dies).
//
// Reused for SCR-13 (edit) as well as SCR-10 (publish) — same shape, `mode` distinguishes them.
// SCR-13's "Edit details" mode never touches `photo`; "Replace photo" mode sets it.

import { create } from 'zustand';
import type { ExtraItem } from '@b-oss/b-api-web';

export type ComposeMode = 'publish' | 'edit';

export interface ComposeLocation {
  lat: number;
  lon: number;
}

export interface ComposePhoto {
  /** Native file URI — absent on web. */
  uri?: string;
  /** Always present — usable as an <img src> on both platforms. */
  webPath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string | null;
  /** Carried through from platform/camera.ts's PickedPhoto for data/photoValidation.ts's
   * max-file-size check, re-run when SCR-10 mounts (SCR-09 itself doesn't validate). */
  sizeBytes: number | null;
}

export interface ThumbnailCropDraft {
  x: number;
  y: number;
  w: number;
}

export interface ComposeDraft {
  mode: ComposeMode;
  accountId: string;
  /** SCR-13 only. */
  entryId?: string;
  /** SCR-13 only: the API's `actions.edit` for this entry — 1 fully editable, 2 only tags and
   * location (older entries), 0 not editable. Absent is treated as 1. Kept on the draft so a
   * resumed draft keeps its restriction. */
  editLevel?: 0 | 1 | 2;
  /** null in SCR-13's "Edit details" mode (no new photo chosen) — the queue item then carries no
   * file, and updateEntry's `image` field is simply omitted. */
  photo: ComposePhoto | null;
  title: string;
  tags: string;
  description: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** SCR-13 only: the entry's date as loaded; `date` is sent on save only when it differs. */
  originalDate?: string;
  location: ComposeLocation | null;
  displayLocation: boolean;
  /** SCR-10 only, members-only — proportional square crop of the untouched photo. */
  thumbnailCrop: ThumbnailCropDraft | null;
  /** SCR-10 only, members-only (b-oss#1037): extra photos to add through the website once the
   * entry is published. Absent is none. */
  extras?: ComposePhoto[];
  /** SCR-13 only (b-oss#1041): ids, on the website, of existing extras to delete on save. */
  extrasRemove?: string[];
  /** SCR-13 only: the entry's current photo (its thumbnail address) as loaded, so the screen can
   * show it again after a trip to the map screen and back. */
  existingImage?: string | null;
  /** What the website said about extras when last read (b-oss#1056): the entry's current extras
   * (SCR-13; none for a new entry) and the member's remaining allowance. Held here, not in the
   * extras block's own state, because opening the map screen unmounts the screen and Back
   * rebuilds it: a reading kept in component state is lost and takes a slow website read to
   * recover. Only a successful read is stored; not user input, so it never makes the draft dirty. */
  siteExtras?: { items: ExtraItem[]; remaining: number | null };
  /** Whether anything has changed since the draft was created/loaded — the discard-guard's input. */
  dirty: boolean;
}

/** Where each draft field's value comes from, so a new field has to be placed (the type makes
 * leaving one out a compile error, and the round-trip matrix test, state/__tests__, fails for a
 * field it has no case for). See docs/ImplementationSpec/compose-state.md.
 *  - input: typed or chosen by the member; patchDraft, marks the draft dirty.
 *  - identity: which draft this is; set once when it is created.
 *  - loaded: read from the server or website; patchLoaded, never dirty.
 */
export const DRAFT_FIELD_KIND: Record<keyof ComposeDraft, 'input' | 'identity' | 'loaded'> = {
  mode: 'identity',
  accountId: 'identity',
  entryId: 'identity',
  editLevel: 'loaded',
  photo: 'input',
  title: 'input',
  tags: 'input',
  description: 'input',
  date: 'input',
  originalDate: 'loaded',
  location: 'input',
  displayLocation: 'input',
  thumbnailCrop: 'input',
  extras: 'input',
  extrasRemove: 'input',
  existingImage: 'loaded',
  siteExtras: 'loaded',
  dirty: 'identity',
};

interface ComposeDraftState {
  draft: ComposeDraft | null;
  setDraft: (draft: ComposeDraft) => void;
  /** Starts an edit draft from what was loaded, unless this entry's edit draft already exists
   * (a load that finishes after the draft was made must not overwrite the member's changes).
   * True when the draft was set. */
  seedEditDraft: (draft: ComposeDraft) => boolean;
  patchDraft: (patch: Partial<ComposeDraft>) => void;
  /** Records something read from the server or website; unlike patchDraft it is not a change by
   * the member, so it leaves `dirty` alone. */
  patchLoaded: (patch: Partial<ComposeDraft>) => void;
  clearDraft: () => void;
}

export const useComposeDraftStore = create<ComposeDraftState>((set, get) => ({
  draft: null,

  setDraft: (draft) => set({ draft }),

  seedEditDraft: (next) => {
    const current = get().draft;
    if (current?.mode === 'edit' && current.entryId === next.entryId) return false;
    set({ draft: next });
    return true;
  },

  patchLoaded: (patch) => {
    const current = get().draft;
    if (!current) return;
    set({ draft: { ...current, ...patch } });
  },

  patchDraft: (patch) => {
    const current = get().draft;
    if (!current) return;
    set({ draft: { ...current, ...patch, dirty: true } });
  },

  clearDraft: () => set({ draft: null }),
}));
