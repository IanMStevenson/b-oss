// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The compose draft (app-architecture.md §6, "Draft state"). Survives navigation from SCR-10 to
// SCR-11/SCR-12 and back, and rotation — held here rather than in SCR-10's own component state,
// since SCR-11/SCR-12 write their results directly into it and it must outlive SCR-10 itself
// being (conceptually) mid-navigation. Not persisted to prefs: a Capacitor WebView's JS context
// survives rotation/resize without a reload, so in-memory is enough, and a draft has no business
// surviving an app restart (rules.md's discard-guard framing is about leaving the screen, not
// about resuming after the process dies).
//
// Reused for SCR-13 (edit) as well as SCR-10 (publish) — same shape, `mode` distinguishes them.
// SCR-13's "Edit details" mode never touches `photo`; "Replace photo" mode sets it.

import { create } from 'zustand';

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
  /** null in SCR-13's "Edit details" mode (no new photo chosen) — the queue item then carries no
   * file, and updateEntry's `image` field is simply omitted. */
  photo: ComposePhoto | null;
  title: string;
  tags: string;
  description: string;
  /** 'YYYY-MM-DD'. SCR-13 never changes this (no date field on that screen). */
  date: string;
  location: ComposeLocation | null;
  displayLocation: boolean;
  /** SCR-10 only, members-only — proportional square crop of the untouched photo. */
  thumbnailCrop: ThumbnailCropDraft | null;
  /** Whether anything has changed since the draft was created/loaded — the discard-guard's input. */
  dirty: boolean;
}

interface ComposeDraftState {
  draft: ComposeDraft | null;
  setDraft: (draft: ComposeDraft) => void;
  patchDraft: (patch: Partial<ComposeDraft>) => void;
  clearDraft: () => void;
}

export const useComposeDraftStore = create<ComposeDraftState>((set, get) => ({
  draft: null,

  setDraft: (draft) => set({ draft }),

  patchDraft: (patch) => {
    const current = get().draft;
    if (!current) return;
    set({ draft: { ...current, ...patch, dirty: true } });
  },

  clearDraft: () => set({ draft: null }),
}));
