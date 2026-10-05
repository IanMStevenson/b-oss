// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pure text edits behind the comment composer's formatting toolbar (b-oss#173): given the textarea's
// value and selection, return the new value and where the selection should be. Kept free of the DOM
// so the behaviour is unit-testable; the composer just applies the result to its textarea.

export type FormatTag = 'b' | 'i' | 'u' | 's';

export interface EditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Wraps the selection in `[tag]…[/tag]`, keeping the wrapped text selected so formats can be
 * stacked; with nothing selected, inserts an empty pair and puts the caret between the tags. */
export function wrapWithTag(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  tag: FormatTag,
): EditResult {
  const open = `[${tag}]`;
  const close = `[/${tag}]`;
  const selected = value.slice(selectionStart, selectionEnd);
  const next = value.slice(0, selectionStart) + open + selected + close + value.slice(selectionEnd);
  const innerStart = selectionStart + open.length;
  return { value: next, selectionStart: innerStart, selectionEnd: innerStart + selected.length };
}

/** A link in the form the renderer understands (bbcode.ts): the selection becomes the label of
 * `[url=address]label[/url]`; with nothing selected the address labels itself, `[url]address[/url]`.
 * The caret lands after the link. An empty address changes nothing. */
export function insertLink(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  address: string,
): EditResult {
  const target = address.trim();
  if (target === '') return { value, selectionStart, selectionEnd };
  const selected = value.slice(selectionStart, selectionEnd);
  const link = selected ? `[url=${target}]${selected}[/url]` : `[url]${target}[/url]`;
  const next = value.slice(0, selectionStart) + link + value.slice(selectionEnd);
  const caret = selectionStart + link.length;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}
