// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The comment box as a ProseMirror editor (b-oss#206 spike) — same props and toolbar as
// BBCodeEditor, different engine. ProseMirror keeps its own document model and only uses the DOM
// to show it, so the things the browser handled badly are ours, and predictable:
// - "Stored marks": with nothing selected, B / I / U / S change the formats for the next typed
//   characters in the model, not in the browser. Turning underline or strike off inside
//   underlined text works (the browser can't), and nothing is lost when focus goes to the link
//   field and back.
// - The toolbar shows the model's state, not the browser's guess.
// - Undo is ProseMirror's history; Android keyboard composition is ProseMirror's long-standing
//   DOM-reading machinery.
// The value in and out is still BBCode (../bbcodeProseMirror.ts).

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { EditorState, TextSelection, type Transaction, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Fragment, Slice, type MarkType, type Node as PMNode } from 'prosemirror-model';
import { toggleMark, baseKeymap, splitBlock } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { bbcodeSchema, docFromBBCode, bbcodeFromDoc } from '../bbcodeProseMirror.js';
import { normalizeLinkAddress, type BBCodeEditorProps } from './BBCodeEditor.js';
import styles from './CommentComposer.module.css';

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

/** Pasted text: plain only, one line per line. */
function plainTextSlice(text: string): Slice {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nodes = lines.map((line) =>
    bbcodeSchema.node('line', null, line === '' ? [] : [bbcodeSchema.text(line)]),
  );
  return new Slice(Fragment.from(nodes), 1, 1);
}

export function ProseMirrorBBCodeEditor({
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
    viewRef.current?.setProps({ editable: () => !readOnly });
  }, [readOnly]);

  function run(command: Command): void {
    const view = viewRef.current;
    if (!view || readOnly) return;
    command(view.state, view.dispatch);
    view.focus();
  }

  const view = viewRef.current;
  const state = view?.state;
  const inLink = state ? linkAround(state.doc, state.selection.from) !== null : false;

  function openLink(): void {
    if (!view || readOnly) return;
    const sel = view.state.selection;
    const existing = linkAround(view.state.doc, sel.from);
    setLinkPanel({
      existing: existing ? { from: existing.from, to: existing.to } : null,
      needsText: !existing && sel.empty,
    });
    setLinkAddress(existing?.address ?? '');
    setLinkText('');
  }

  function closeLink(): void {
    setLinkPanel(null);
    // Focus goes back to the editor; its selection and stored marks were never touched.
    view?.focus();
  }

  function confirmLink(): void {
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
        const at = tr.selection.from;
        tr.insertText(text, at).addMark(at, at + text.length, mark);
        tr.setSelection(TextSelection.create(tr.doc, at + text.length)).removeStoredMark(link);
      } else {
        const { from, to } = tr.selection;
        tr.removeMark(from, to, link).addMark(from, to, mark);
      }
      view.dispatch(tr.scrollIntoView());
    }
    setLinkPanel(null);
    view.focus();
  }

  function removeLink(): void {
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
