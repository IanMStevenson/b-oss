// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// State for the entry page's inline comment composers (b-oss#172, replacing SCR-15's separate
// screen): the always-present "new comment" box at the bottom, plus at most one reply or edit box
// open against a particular comment. Text is mirrored into data/commentDrafts.ts so it survives
// swiping to another entry; a successful post clears it and silently refreshes the entry so the
// new comment appears without the page flashing to a spinner.

import { useState } from 'react';
import { postComment, editComment } from '../../flows/commentsFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { t } from '../../strings/index.js';
import {
  getDraft,
  setDraft,
  clearDraft,
  newCommentKey,
  replyKey,
  editKey,
} from '../../data/commentDrafts.js';

/** The reply/edit box currently open. `viewId` is b-view's comment id (what the render slots
 * receive); `apiId` is the API's `comment_id_str` (what a post needs). */
export type ComposerTarget =
  | { kind: 'reply'; viewId: string; apiId: string }
  | { kind: 'edit'; viewId: string; apiId: string; original: string };

interface Options {
  entryId: string;
  /** Sign-in / account-confirm / read-write gate, run at submit time (FLW-06/07). */
  gate: () => Promise<boolean>;
  /** Called after a post succeeds, to refresh the comments in place. */
  onPosted: () => void;
}

export function useCommentComposers({ entryId, gate, onPosted }: Options) {
  const [mainValue, setMainValueState] = useState(() => getDraft(newCommentKey(entryId)) ?? '');
  const [target, setTarget] = useState<ComposerTarget | null>(null);
  const [targetValue, setTargetValueState] = useState('');
  const [posting, setPosting] = useState<'main' | 'target' | null>(null);
  const [error, setError] = useState<{ where: 'main' | 'target'; message: string } | null>(null);

  function setMainValue(text: string): void {
    setMainValueState(text);
    setDraft(newCommentKey(entryId), text);
  }

  function targetKey(tgt: ComposerTarget): string {
    return tgt.kind === 'reply' ? replyKey(tgt.apiId) : editKey(tgt.apiId);
  }

  function setTargetValue(text: string): void {
    setTargetValueState(text);
    if (target) setDraft(targetKey(target), text);
  }

  function openReply(viewId: string, apiId: string): void {
    const next: ComposerTarget = { kind: 'reply', viewId, apiId };
    setTarget(next);
    setTargetValueState(getDraft(replyKey(apiId)) ?? '');
    setError(null);
  }

  function openEdit(viewId: string, apiId: string, original: string): void {
    const next: ComposerTarget = { kind: 'edit', viewId, apiId, original };
    setTarget(next);
    // A saved draft of this edit wins over the original text, so a half-done edit isn't reset.
    setTargetValueState(getDraft(editKey(apiId)) ?? original);
    setError(null);
  }

  /** Closes the reply/edit box. The draft stays (Cancel isn't "discard"); only a post clears it. */
  function closeTarget(): void {
    setTarget(null);
    setError((e) => (e?.where === 'target' ? null : e));
  }

  async function run(where: 'main' | 'target', send: () => Promise<unknown>, done: () => void) {
    if (posting) return;
    if (!(await gate())) return;
    setPosting(where);
    setError(null);
    try {
      await send();
      done();
      onPosted();
    } catch (err) {
      // The text stays in the box (and in the draft) so the user can simply try again.
      setError({
        where,
        message: describeError(mapApiError(err), t('SCR-15.error.post_failed')),
      });
    } finally {
      setPosting(null);
    }
  }

  function submitMain(): Promise<void> {
    const content = mainValue;
    return run(
      'main',
      () => postComment({ entryId, content }),
      () => {
        clearDraft(newCommentKey(entryId));
        setMainValueState('');
      },
    );
  }

  function submitTarget(): Promise<void> {
    if (!target) return Promise.resolve();
    const current = target;
    const content = targetValue;
    return run(
      'target',
      () =>
        current.kind === 'reply'
          ? postComment({ entryId, content, parentId: current.apiId })
          : editComment({ commentId: current.apiId, content }),
      () => {
        clearDraft(targetKey(current));
        setTarget(null);
        setTargetValueState('');
      },
    );
  }

  return {
    mainValue,
    setMainValue,
    mainPosting: posting === 'main',
    mainError: error?.where === 'main' ? error.message : null,
    submitMain,
    target,
    targetValue,
    setTargetValue,
    targetPosting: posting === 'target',
    targetError: error?.where === 'target' ? error.message : null,
    openReply,
    openEdit,
    closeTarget,
    submitTarget,
  };
}
