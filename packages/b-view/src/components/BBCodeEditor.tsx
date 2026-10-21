// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The comment composer's rich-text box (b-oss#206): toolbar formatting shows as formatting — bold
// looks bold, links look like links — while the value going in and out is BBCode, as on
// blipfoto.com. The B / I / U / S / link toolbar sits in the box's footer.
//
// Built on ProseMirror, which keeps its own document model and uses the DOM only to show it. An
// earlier version edited the browser's DOM directly with its built-in formatting commands (as
// blipfoto.com's editor does), and inherited the browser's faults: the formats for the next typed
// characters live in hidden browser state, so underline/strike couldn't be turned off inside
// underlined text, and moving focus to the link field and back silently dropped them. Here they
// are ProseMirror "stored marks" in the model, and the toolbar shows the model's state.
//
// - Typing, Enter, IME composition (Android keyboards) and undo are ProseMirror's.
// - Stored BBCode is loaded (../bbcodeProseMirror.ts) only when `value` arrives from outside — a
//   draft, the comment being edited, the box clearing after a post — never in response to the
//   user's own typing.
// - Paste is plain text: formatting from elsewhere has no BBCode to keep.
// - The link field can add, change or remove a link.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { EditorState, TextSelection, type Transaction, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Fragment, Slice, type MarkType, type Node as PMNode } from 'prosemirror-model';
import { toggleMark, baseKeymap, splitBlock } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { bbcodeSchema, docFromBBCode, bbcodeFromDoc } from '../bbcodeProseMirror.js';
import styles from './CommentComposer.module.css';

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

const { b, i, u, s, link } = bbcodeSchema.marks as Record<'b' | 'i' | 'u' | 's' | 'link', MarkType>;

type Format = 'b' | 'i' | 'u' | 's';

const FORMAT_BUTTONS: { format: Format; letter: string; label: string; className: string }[] = [
  { format: 'b', letter: 'B', label: 'Bold', className: styles.fmtBold },
  { format: 'i', letter: 'I', label: 'Italic', className: styles.fmtItalic },
  { format: 'u', letter: 'U', label: 'Underline', className: styles.fmtUnderline },
  { format: 's', letter: 'S', label: 'Strikethrough', className: styles.fmtStrike },
];

const MARKS: Record<Format, MarkType> = { b, i, u, s };

/** Whether a format is on: at a caret, the stored marks (or those of the text before it); over a
 * selection, whether any of it has the format (so the button takes it off, as toggleMark does). */
function isActive(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection;
  if (empty) return type.isInSet(state.storedMarks ?? $from.marks()) !== undefined;
  return state.doc.rangeHasMark(from, to, type);
}

/** The extent of the link at `pos` (on the text just after or just before it), if there is one. */
function linkAround(
  doc: PMNode,
  pos: number,
): { from: number; to: number; address: string; email: boolean } | null {
  const $pos = doc.resolve(pos);
  const mark =
    ($pos.nodeAfter && link.isInSet($pos.nodeAfter.marks)) ??
    ($pos.nodeBefore && link.isInSet($pos.nodeBefore.marks));
  if (!mark) return null;
  // Runs of the line's text carrying this exact link, as document ranges.
  const runs: { from: number; to: number }[] = [];
  let current: { from: number; to: number } | null = null;
  $pos.parent.forEach((child, offset) => {
    const from = $pos.start() + offset;
    const to = from + child.nodeSize;
    if (!mark.isInSet(child.marks)) current = null;
    else if (current && current.to === from) current.to = to;
    else runs.push((current = { from, to }));
  });
  const run = runs.find((r) => r.from <= pos && pos <= r.to);
  if (!run) return null;
  const { address, email } = mark.attrs as { address: string; email: boolean };
  return { ...run, address, email };
}

/** Brings the editor's selection up to date with the browser's before a toolbar action. The
 * browser reports selection changes asynchronously, so a tap straight after moving the selection
 * (dragging a handle, Shift+arrow) could otherwise act on where it was a moment before. Only
 * dispatches when they differ: setting the selection drops the formats chosen for the next
 * typed characters, which is right if the caret really moved and wrong otherwise. */
function syncSelection(view: EditorView): void {
  const sel = view.dom.ownerDocument.getSelection();
  if (!sel?.anchorNode || !sel.focusNode || !view.dom.contains(sel.anchorNode)) return;
  if (!view.dom.contains(sel.focusNode)) return;
  const anchor = view.posAtDOM(sel.anchorNode, sel.anchorOffset);
  const head = view.posAtDOM(sel.focusNode, sel.focusOffset);
  const current = view.state.selection;
  if (anchor === current.anchor && head === current.head) return;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
}

/** Pasted text: plain only, one line per line. */
function plainTextSlice(text: string): Slice {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nodes = lines.map((line) =>
    bbcodeSchema.node('line', null, line === '' ? [] : [bbcodeSchema.text(line)]),
  );
  return new Slice(Fragment.from(nodes), 1, 1);
}

export function BBCodeEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  readOnly,
  autoFocus,
}: BBCodeEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** The BBCode the editor currently holds — what we last loaded or last reported. */
  const shown = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  // Bumped on every transaction so the toolbar re-reads the editor state.
  const [, setVersion] = useState(0);

  const [linkPanel, setLinkPanel] = useState<{
    existing: { from: number; to: number } | null;
    /** The selection when the panel opened — what the link applies to, whatever happens to the
     * editor's selection while focus is in the address field. */
    from: number;
    to: number;
    needsText: boolean;
  } | null>(null);
  const [linkAddress, setLinkAddress] = useState('');
  const [linkText, setLinkText] = useState('');

  function makeState(source: string): EditorState {
    const toggle = (type: MarkType): Command => toggleMark(type);
    return EditorState.create({
      doc: docFromBBCode(source),
      plugins: [
        history(),
        keymap({
          'Mod-b': toggle(b),
          'Mod-i': toggle(i),
          'Mod-u': toggle(u),
          'Mod-z': undo,
          'Shift-Mod-z': redo,
          'Mod-y': redo,
          // There are only lines: Shift+Enter is a new line too.
          'Shift-Enter': splitBlock,
        }),
        keymap(baseKeymap),
      ],
    });
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const view = new EditorView(mount, {
      state: makeState(value),
      editable: () => !readOnlyRef.current,
      attributes: (state) => ({
        class: styles.editor,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
        'aria-readonly': readOnlyRef.current ? 'true' : 'false',
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        'data-empty':
          state.doc.childCount === 1 && state.doc.child(0).content.size === 0 ? 'true' : 'false',
        spellcheck: 'true',
      }),
      dispatchTransaction(tr: Transaction) {
        const next = view.state.apply(tr);
        view.updateState(next);
        if (tr.docChanged) {
          const bbcode = bbcodeFromDoc(next.doc);
          if (bbcode !== shown.current) {
            shown.current = bbcode;
            onChangeRef.current(bbcode);
          }
        }
        setVersion((v) => v + 1);
      },
      handlePaste(v, event) {
        const text = event.clipboardData?.getData('text/plain');
        if (text) v.dispatch(v.state.tr.replaceSelection(plainTextSlice(text)).scrollIntoView());
        return true;
      },
      handleDrop: () => true,
      handleDOMEvents: {
        // A link in the box is for editing, not following.
        click: (_v, event) => {
          if ((event.target as Element).closest('a')) event.preventDefault();
          return false;
        },
        focus: () => {
          setVersion((v) => v + 1);
          return false;
        },
      },
    });
    viewRef.current = view;
    shown.current = value;
    // Render again now the view exists, so the toolbar reflects it.
    setVersion((v) => v + 1);
    if (autoFocus) {
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
      view.focus();
    }
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; `value` changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load `value` only when it didn't come from the editor itself (a draft, a cleared box).
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || value === shown.current) return;
    view.updateState(makeState(value));
    shown.current = value;
    setVersion((v) => v + 1);
  }, [value]);

  useEffect(() => {
    // Re-reads `editable` and the attributes (aria-readonly).
    viewRef.current?.setProps({ editable: () => !readOnly });
  }, [readOnly]);

  function run(command: Command): void {
    const view = viewRef.current;
    if (!view || readOnly) return;
    syncSelection(view);
    command(view.state, view.dispatch);
    view.focus();
  }

  // For rendering the toolbar. Handlers read viewRef.current themselves, at the moment they run.
  const state = viewRef.current?.state;
  const inLink = state ? linkAround(state.doc, state.selection.from) !== null : false;

  function openLink(): void {
    const view = viewRef.current;
    if (!view || readOnly) return;
    syncSelection(view);
    const sel = view.state.selection;
    const existing = linkAround(view.state.doc, sel.from);
    setLinkPanel({
      existing: existing ? { from: existing.from, to: existing.to } : null,
      from: sel.from,
      to: sel.to,
      needsText: !existing && sel.empty,
    });
    setLinkAddress(existing?.address ?? '');
    setLinkText('');
  }

  function closeLink(): void {
    const view = viewRef.current;
    setLinkPanel(null);
    // Focus goes back to the editor; its selection and stored marks were never touched.
    view?.focus();
  }

  function confirmLink(): void {
    const view = viewRef.current;
    if (!view || !linkPanel) return;
    const href = normalizeLinkAddress(linkAddress);
    if (href !== '') {
      const email = href.startsWith('mailto:');
      const mark = link.create({ address: email ? href.slice('mailto:'.length) : href, email });
      const { tr } = view.state;
      if (linkPanel.existing) {
        const { from, to } = linkPanel.existing;
        tr.removeMark(from, to, link).addMark(from, to, mark);
      } else if (linkPanel.needsText) {
        const text = linkText.trim() || linkAddress.trim();
        const at = linkPanel.from;
        tr.insertText(text, at).addMark(at, at + text.length, mark);
        tr.setSelection(TextSelection.create(tr.doc, at + text.length)).removeStoredMark(link);
      } else {
        const { from, to } = linkPanel;
        tr.removeMark(from, to, link).addMark(from, to, mark);
      }
      view.dispatch(tr.scrollIntoView());
    }
    setLinkPanel(null);
    view.focus();
  }

  function removeLink(): void {
    const view = viewRef.current;
    if (!view || !linkPanel?.existing) return;
    const { from, to } = linkPanel.existing;
    view.dispatch(view.state.tr.removeMark(from, to, link));
    setLinkPanel(null);
    view.focus();
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
      <div ref={mountRef} className={styles.pmMount} />
      <div className={styles.footer}>
        {linkPanel && (
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
            {linkPanel.needsText && (
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
              {linkPanel.existing && (
                <button type="button" className={styles.linkRemove} onClick={removeLink}>
                  Remove link
                </button>
              )}
              <button type="button" className={styles.linkCancel} onClick={closeLink}>
                Cancel
              </button>
              <button type="button" className={styles.linkAdd} onClick={confirmLink}>
                {linkPanel.existing ? 'Update link' : 'Add link'}
              </button>
            </div>
          </div>
        )}
        <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
          {FORMAT_BUTTONS.map(({ format, letter, label, className }) => (
            <button
              key={format}
              type="button"
              className={`${styles.fmtBtn} ${className}`}
              aria-label={label}
              aria-pressed={state ? isActive(state, MARKS[format]) : false}
              disabled={readOnly}
              // Keep the editor focused (and the keyboard up) when a button is tapped.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(toggleMark(MARKS[format]))}
            >
              {letter}
            </button>
          ))}
          <button
            type="button"
            className={styles.fmtBtn}
            aria-label={inLink ? 'Edit link' : 'Link'}
            aria-pressed={inLink}
            aria-expanded={linkPanel !== null}
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
