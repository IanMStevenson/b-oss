// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The inline comment composer (b-oss#172): a bordered box with a right-aligned "Add comment" pill,
// as on blipfoto.com. Purely presentational — the host owns the text (so it can keep a draft
// across navigation), performs the post, and reports `posting` / `error` back. Used for a new
// comment, a reply (beneath the comment being replied to) and an edit (in place of the comment).
//
// Plain text, with an optional formatting toolbar in the box's footer (`formatting`): B / I / U / S
// wrap the selection in BBCode and the link button asks for an address (b-oss#173). Which edits
// each button makes lives in ../bbcodeEdit.ts, so it is testable without a DOM.

import { useEffect, useRef, useState } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { wrapWithTag, insertLink, type FormatTag, type EditResult } from '../bbcodeEdit.js';
import styles from './CommentComposer.module.css';

const FORMAT_BUTTONS: { tag: FormatTag; label: string; className: string }[] = [
  { tag: 'b', label: 'Bold', className: styles.fmtBold },
  { tag: 'i', label: 'Italic', className: styles.fmtItalic },
  { tag: 'u', label: 'Underline', className: styles.fmtUnderline },
  { tag: 's', label: 'Strikethrough', className: styles.fmtStrike },
];

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
  /** Show the B / I / U / S / link toolbar in the box's footer. */
  formatting?: boolean;
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
  formatting = false,
}: CommentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = value.trim().length > 0 && !posting;
  // The link button asks for an address in a small inline field. The textarea's selection is
  // remembered when it opens, because focus moves to that field.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkAddress, setLinkAddress] = useState('');
  const savedSelection = useRef({ start: 0, end: 0 });

  /** Applies an edit to the controlled value, then puts focus and the selection back. */
  function apply(edit: EditResult): void {
    onChange(edit.value);
    requestAnimationFrame(() => {
      const box = textareaRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  function format(tag: FormatTag): void {
    const box = textareaRef.current;
    if (!box || posting) return;
    apply(wrapWithTag(box.value, box.selectionStart, box.selectionEnd, tag));
  }

  function openLink(): void {
    const box = textareaRef.current;
    if (!box || posting) return;
    savedSelection.current = { start: box.selectionStart, end: box.selectionEnd };
    setLinkAddress('');
    setLinkOpen(true);
  }

  function confirmLink(): void {
    const { start, end } = savedSelection.current;
    apply(insertLink(value, start, end, linkAddress));
    setLinkOpen(false);
  }

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
        {formatting && (
          <div className={styles.footer}>
            {linkOpen && (
              <div className={styles.linkRow}>
                <input
                  type="url"
                  className={styles.linkInput}
                  value={linkAddress}
                  onChange={(e) => setLinkAddress(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter confirms the link — it must not submit the whole comment.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmLink();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setLinkOpen(false);
                    }
                  }}
                  placeholder="Link address, e.g. https://…"
                  aria-label="Link address"
                  autoFocus
                />
                <button type="button" className={styles.linkAdd} onClick={confirmLink}>
                  Add link
                </button>
                <button
                  type="button"
                  className={styles.linkCancel}
                  onClick={() => setLinkOpen(false)}
                >
                  Cancel
                </button>
              </div>
            )}
            <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
              {FORMAT_BUTTONS.map(({ tag, label, className }) => (
                <button
                  key={tag}
                  type="button"
                  className={`${styles.fmtBtn} ${className}`}
                  aria-label={label}
                  disabled={posting}
                  // Keep the textarea focused (and its selection) when a button is tapped.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => format(tag)}
                >
                  {tag.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                className={styles.fmtBtn}
                aria-label="Link"
                aria-expanded={linkOpen}
                disabled={posting}
                onMouseDown={(e) => e.preventDefault()}
                onClick={openLink}
              >
                <LinkIcon size={15} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        )}
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
