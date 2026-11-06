// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The formatting toolbar shared by every BBCode editing surface (§14: "editing is plain text plus
// a toolbar... the toolbar wraps the current selection or inserts at the caret, operating on the
// raw string in a <textarea>"). Extracted from SCR-15's comment editor (Phase 4), which built this
// first and left a TODO to factor it out once SCR-11 needed the same behaviour — this is that.
//
// A plain native <textarea> (with a ref), not IonTextarea: wrapping the selection needs real
// selectionStart/selectionEnd, which means reaching past Ionic's shadow-DOM wrapper.
//
// Five tags, one conditional (§14/§21's corrected set — not the spec's own stale "bold, italic,
// link, quote" wording): bold/italic/underline/strikethrough always; link is the one that's
// conditional on context — SCR-11 (entry description) shows it, SCR-15 (comments) doesn't, per
// each screen's own `tags` prop. This module doesn't decide that; callers do.

import { useEffect } from 'react';
import { BBCODE_TAGS } from '@b-oss/b-view';

export type BBCodeTag = (typeof BBCODE_TAGS)[number];

const TAG_LABELS: Record<BBCodeTag, string> = {
  b: 'B',
  i: 'I',
  u: 'U',
  s: 'S',
  url: 'Link',
};

/** Wraps the current selection (or inserts an empty pair at the caret) in `[tag]...[/tag]`,
 * updates the controlled value, and restores focus + a sensible cursor position — reused as-is by
 * every BBCode-editing screen so the wrapping behaviour can't drift between them. */
export function wrapSelection(
  textarea: HTMLTextAreaElement,
  tag: BBCodeTag,
  setValue: (value: string) => void,
): void {
  const { selectionStart, selectionEnd, value } = textarea;
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);
  const next = `${before}[${tag}]${selected}[/${tag}]${after}`;
  setValue(next);
  const cursor = selectionStart + tag.length + 2 + selected.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
}

interface BBCodeToolbarProps {
  tags: readonly BBCodeTag[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}

const SHORTCUT_TAGS: Record<string, BBCodeTag> = { b: 'b', i: 'i', u: 'u', s: 's', l: 'url' };

export function BBCodeToolbar({ tags, textareaRef, onChange }: BBCodeToolbarProps) {
  // Ctrl+B / I / U / S (strikethrough) / L (link) in the text box, for the tags this screen offers.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const ta = textareaRef.current;
      if (!ta || e.target !== ta) return;
      const tag = SHORTCUT_TAGS[e.key.toLowerCase()];
      if (!tag || !tags.includes(tag)) return;
      e.preventDefault();
      wrapSelection(ta, tag, onChange);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tags, textareaRef, onChange]);

  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          tabIndex={-1}
          aria-label={`Insert ${TAG_LABELS[tag]} formatting`}
          onClick={() => {
            if (textareaRef.current) wrapSelection(textareaRef.current, tag, onChange);
          }}
          style={{
            padding: '4px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg-alt)',
            fontWeight: tag === 'b' ? 'bold' : undefined,
            fontStyle: tag === 'i' ? 'italic' : undefined,
            textDecoration: tag === 'u' ? 'underline' : tag === 's' ? 'line-through' : undefined,
          }}
        >
          {TAG_LABELS[tag]}
        </button>
      ))}
    </div>
  );
}
