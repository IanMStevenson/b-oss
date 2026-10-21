// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Unsent comment text, kept in memory for the life of the app session (b-oss#172). The old
// separate compose screen guarded against losing text with a "Discard comment?" prompt on the way
// out; an inline composer has no "way out" to hang that on — swiping to the next entry or going
// back would just drop what was typed. So instead nothing is dropped: the text is remembered per
// target and restored when you return, and cleared only on a successful post.
//
// Deliberately NOT persisted across app restarts: a half-written comment is a short-lived thing,
// and this keeps a stale draft from resurfacing days later. Keys: `new:<entryId>`,
// `reply:<commentId>`, `edit:<commentId>`.

const drafts = new Map<string, string>();

export const newCommentKey = (entryId: string): string => `new:${entryId}`;
export const replyKey = (commentId: string): string => `reply:${commentId}`;
export const editKey = (commentId: string): string => `edit:${commentId}`;

export function getDraft(key: string): string | undefined {
  return drafts.get(key);
}

/** Saves `text`; an empty (or whitespace-only) draft is the same as none, so it's dropped. */
export function setDraft(key: string, text: string): void {
  if (text.trim().length === 0) drafts.delete(key);
  else drafts.set(key, text);
}

export function clearDraft(key: string): void {
  drafts.delete(key);
}

/** Test seam. */
export function clearAllDrafts(): void {
  drafts.clear();
}
