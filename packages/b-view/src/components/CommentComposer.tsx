// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The inline comment composer (b-oss#172): a bordered box with a right-aligned "Add comment" pill,
// as on blipfoto.com. Purely presentational — the host owns the text (so it can keep a draft
// across navigation), performs the post, and reports `posting` / `error` back. Used for a new
// comment, a reply (beneath the comment being replied to) and an edit (in place of the comment).
//
// Phase 1 is plain text. The formatting toolbar (bold/italic/…) is phase 2 (b-oss#173) and will
// sit in the box's footer.

import { useEffect, useRef } from 'react';
import styles from './CommentComposer.module.css';

export interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user submits a non-empty comment (never while `posting`). */
  onSubmit: () => void;
  /** Disables the box and shows "Posting…" on the button while the host's request is in flight. */
  posting?: boolean;
  /** Shown beneath the box when the last attempt failed — the text is kept so it can be retried. */
  error?: string | null;
  /** The button's label: "Add comment" (default), "Reply", "Save". */
  submitLabel?: string;
  placeholder?: string;
  /** Accessible name of the text box, which has no visible label. */
  ariaLabel?: string;
  /** Provided for a reply or an edit, which the user may back out of: renders a Cancel button. */
  onCancel?: () => void;
  /** Focus the box on mount — for a reply/edit the user just asked for. */
  autoFocus?: boolean;
}

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  posting = false,
  error = null,
  submitLabel = 'Add comment',
  placeholder,
  ariaLabel = 'Your comment',
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = value.trim().length > 0 && !posting;

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
    // Only on mount: re-focusing on every render would fight the user's own focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className={styles.box}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-busy={posting}
          readOnly={posting}
          rows={5}
        />
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={posting}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {posting ? 'Posting…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
