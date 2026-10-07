// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The comment composer's rich-text box (b-oss#206): an editable surface that shows formatting —
// bold looks bold, links look like links — while the value going in and out is BBCode, as on
// blipfoto.com. The B / I / U / S / link toolbar sits in the box's footer.
//
// How it fits together:
// - The surface is a plain contenteditable <div> that React never re-renders the children of.
//   Stored BBCode is drawn into it (../bbcodeDom.ts `renderBBCode`) only when `value` arrives from
//   outside — a draft, the comment being edited, the box being cleared after a post — never in
//   response to the user's own typing. Rewriting the DOM mid-word would break the Android
//   keyboard's composition (predictive text, autocorrect underlines) and lose the caret.
// - Every `input` event reads the DOM back to BBCode (`serializeBBCode`) and reports it.
// - B / I / U / S use the browser's own formatting command, as blipfoto.com does: it toggles,
//   applies to the next typed characters when nothing is selected, keeps native undo, and
//   handles partly-formatted selections. Ctrl+B / I / U come free with contenteditable.
// - Links and paste are ours: the link field can also change or remove an existing link, and
//   paste is plain text (formatting from elsewhere has no BBCode and would only half-survive).
// - The selection is remembered as it changes, and toolbar buttons don't take focus, so tapping
//   one on a phone neither drops the selection nor closes the keyboard.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { renderBBCode, serializeBBCode } from '../bbcodeDom.js';
import styles from './CommentComposer.module.css';

type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough';

const FORMAT_BUTTONS: {
  command: FormatCommand;
  letter: string;
  label: string;
  className: string;
}[] = [
  { command: 'bold', letter: 'B', label: 'Bold', className: styles.fmtBold },
  { command: 'italic', letter: 'I', label: 'Italic', className: styles.fmtItalic },
  { command: 'underline', letter: 'U', label: 'Underline', className: styles.fmtUnderline },
  { command: 'strikeThrough', letter: 'S', label: 'Strikethrough', className: styles.fmtStrike },
];

type ActiveFormats = Record<FormatCommand, boolean>;
const NONE_ACTIVE: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
};

const EMAIL = /^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/;

/** The href for an address as typed: an email address becomes `mailto:` (saved as `[email]`), and
 * one with no scheme gets `https://`. */
export function normalizeLinkAddress(address: string): string {
  const target = address.trim();
  if (target === '') return '';
  if (EMAIL.test(target)) return `mailto:${target}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  return `https://${target.replace(/^\/+/, '')}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `document.execCommand` is deprecated but still the only way to edit a contenteditable that the
 * browser's own undo understands, and it's present in every browser and WebView we run in. */
function exec(command: string, arg?: string): boolean {
  const run = (document as { execCommand?: (c: string, ui: boolean, v?: string) => boolean })
    .execCommand;
  return run ? run.call(document, command, false, arg) : false;
}

function queryState(command: FormatCommand): boolean {
  const query = (document as { queryCommandState?: (c: string) => boolean }).queryCommandState;
  try {
    return query ? query.call(document, command) : false;
  } catch {
    return false;
  }
}

function anchorAround(node: Node | null, root: HTMLElement): HTMLAnchorElement | null {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  const anchor = el?.closest('a');
  return anchor && root.contains(anchor) ? anchor : null;
}

export interface BBCodeEditorProps {
  /** BBCode. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string | undefined;
  /** While a post is in flight: not editable, toolbar disabled. */
  readOnly: boolean;
  autoFocus: boolean;
}

export function BBCodeEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  readOnly,
  autoFocus,
}: BBCodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  /** The BBCode the DOM currently holds — what we last drew or last reported. */
  const shown = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [active, setActive] = useState<ActiveFormats>(NONE_ACTIVE);
  const [inLink, setInLink] = useState(false);

  // Link field: `anchor` is set when changing an existing link; `needsText` when there's no
  // selection to become the link's text.
  const [link, setLink] = useState<{ anchor: HTMLAnchorElement | null; needsText: boolean } | null>(
    null,
  );
  const [linkAddress, setLinkAddress] = useState('');
  const [linkText, setLinkText] = useState('');

  // Draw `value` only when it didn't come from the DOM itself.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === shown.current) return;
    renderBBCode(editor, value);
    shown.current = value;
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (autoFocus) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // Remember the selection while it's in the box, and reflect its formatting in the toolbar.
    function onSelectionChange(): void {
      const sel = window.getSelection();
      if (!editor || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;
      savedRange.current = range.cloneRange();
      setActive({
        bold: queryState('bold'),
        italic: queryState('italic'),
        underline: queryState('underline'),
        strikeThrough: queryState('strikeThrough'),
      });
      setInLink(anchorAround(range.startContainer, editor) !== null);
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
    // Only on mount: re-focusing on every render would fight the user's own focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function report(): void {
    const editor = editorRef.current;
    if (!editor) return;
    const next = serializeBBCode(editor);
    if (next === shown.current) return;
    shown.current = next;
    onChange(next);
  }

  /** Puts focus and the remembered selection back in the box before a command. */
  function restoreSelection(): void {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement !== editor) editor.focus();
    const range = savedRange.current;
    const sel = window.getSelection();
    if (range && sel && editor.contains(range.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function format(command: FormatCommand): void {
    if (readOnly) return;
    restoreSelection();
    exec('styleWithCSS', 'false');
    exec(command);
    report();
    setActive((a) => ({ ...a, [command]: queryState(command) }));
  }

  function openLink(): void {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const range = savedRange.current;
    const anchor = range ? anchorAround(range.startContainer, editor) : null;
    setLink({ anchor, needsText: !anchor && (!range || range.collapsed) });
    setLinkAddress(anchor?.getAttribute('href')?.replace(/^mailto:/i, '') ?? '');
    setLinkText('');
  }

  function closeLink(): void {
    setLink(null);
    restoreSelection();
  }

  function selectAnchor(anchor: HTMLAnchorElement): void {
    const range = document.createRange();
    range.selectNodeContents(anchor);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function confirmLink(): void {
    if (!link) return;
    const href = normalizeLinkAddress(linkAddress);
    restoreSelection();
    if (href !== '') {
      if (link.anchor) {
        selectAnchor(link.anchor);
        exec('createLink', href);
      } else if (link.needsText) {
        const text = linkText.trim() || linkAddress.trim();
        exec('insertHTML', `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`);
      } else {
        exec('createLink', href);
      }
      report();
    }
    setLink(null);
  }

  function removeLink(): void {
    if (!link?.anchor) return;
    restoreSelection();
    selectAnchor(link.anchor);
    exec('unlink');
    report();
    setLink(null);
  }

  const linkFieldKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter confirms the link — it must not submit the whole comment.
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmLink();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeLink();
    }
  };

  return (
    <>
      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        aria-busy={readOnly}
        aria-readonly={readOnly}
        data-placeholder={placeholder}
        data-empty={value === '' ? 'true' : undefined}
        spellCheck
        onInput={report}
        onBlur={report}
        onPaste={(e) => {
          // Plain text only: pasted formatting has no BBCode equivalent to keep.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          if (text) exec('insertText', text.replace(/\r\n?/g, '\n'));
          report();
        }}
        onDrop={(e) => e.preventDefault()}
        onClick={(e) => {
          // A link in the box is for editing, not following.
          if ((e.target as Element).closest('a')) e.preventDefault();
        }}
      />
      <div className={styles.footer}>
        {link && (
          <div className={styles.linkPanel}>
            <div className={styles.linkRow}>
              <input
                type="url"
                inputMode="url"
                className={styles.linkInput}
                value={linkAddress}
                onChange={(e) => setLinkAddress(e.target.value)}
                onKeyDown={linkFieldKeys}
                placeholder="Link address, e.g. https://…"
                aria-label="Link address"
                autoFocus
              />
            </div>
            {link.needsText && (
              <div className={styles.linkRow}>
                <input
                  type="text"
                  className={styles.linkInput}
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={linkFieldKeys}
                  placeholder="Text to show (optional)"
                  aria-label="Link text"
                />
              </div>
            )}
            <div className={styles.linkActions}>
              {link.anchor && (
                <button type="button" className={styles.linkRemove} onClick={removeLink}>
                  Remove link
                </button>
              )}
              <button type="button" className={styles.linkCancel} onClick={closeLink}>
                Cancel
              </button>
              <button type="button" className={styles.linkAdd} onClick={confirmLink}>
                {link.anchor ? 'Update link' : 'Add link'}
              </button>
            </div>
          </div>
        )}
        <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
          {FORMAT_BUTTONS.map(({ command, letter, label, className }) => (
            <button
              key={command}
              type="button"
              className={`${styles.fmtBtn} ${className}`}
              aria-label={label}
              aria-pressed={active[command]}
              disabled={readOnly}
              // Keep the box focused (and its selection) when a button is tapped.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => format(command)}
            >
              {letter}
            </button>
          ))}
          <button
            type="button"
            className={styles.fmtBtn}
            aria-label={inLink ? 'Edit link' : 'Link'}
            aria-pressed={inLink}
            aria-expanded={link !== null}
            disabled={readOnly}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openLink}
          >
            <LinkIcon size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </>
  );
}
