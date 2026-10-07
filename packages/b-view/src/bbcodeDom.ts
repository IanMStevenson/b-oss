// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// BBCode <-> DOM for the rich comment editor (b-oss#206). The editor is a contenteditable box that
// shows formatting rather than tags, but what it reads and writes is BBCode, so these two halves
// carry everything across:
//
// - `renderBBCode` turns stored BBCode into editor DOM: one <div> per line, formatting as
//   <b>/<i>/<u>/<s>/<a>. Every recognised tag pair becomes formatting, however it got there, so a
//   tag someone typed by hand turns into real formatting the next time the comment is edited. That
//   matches blipfoto.com, whose editor never scans typed text but always parses what it loads.
// - `serializeBBCode` walks whatever DOM the browser has produced (its own formatting commands,
//   Enter, Backspace, IME) and writes BBCode. It accepts every spelling a browser might use for a
//   format (<strong>, <em>, <strike>, <del>, inline styles), merges adjacent runs of the same
//   format, drops empty ones, and never escapes brackets — typed brackets are just text.
//
// Pure functions of a Document, with no React, so the round trip is unit-testable under jsdom.

/** The tags a comment can carry — the five blipfoto.com renders, plus `email`, its mailto variant
 * of `url`. Anything else stays as literal text. */
export type BBTag = 'b' | 'i' | 'u' | 's' | 'url' | 'email';

const TAGS: readonly BBTag[] = ['b', 'i', 'u', 's', 'url', 'email'];
const TAKES_ADDRESS: ReadonlySet<BBTag> = new Set<BBTag>(['url', 'email']);

/** A parsed tag pair. */
interface TagNode {
  kind: 'tag';
  tag: BBTag;
  /** The address of a `[url=…]` / `[email=…]`; undefined for the bare `[url]address[/url]` form. */
  attr?: string;
  children: BBNode[];
}

type BBNode = string | TagNode;

const TOKEN = /\[(\/?)([a-z]+)(?:=([^\]]*))?\]/gi;

function stripQuotes(attr: string): string {
  const t = attr.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
}

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'open'; tag: BBTag; attr?: string; source: string }
  | { kind: 'close'; tag: BBTag; source: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of source.matchAll(TOKEN)) {
    const [whole, slash, rawName, rawAttr] = match;
    const name = rawName.toLowerCase() as BBTag;
    if (match.index > cursor)
      tokens.push({ kind: 'text', text: source.slice(cursor, match.index) });
    cursor = match.index + whole.length;
    const valid =
      TAGS.includes(name) && (rawAttr === undefined || (!slash && TAKES_ADDRESS.has(name)));
    if (!valid) tokens.push({ kind: 'text', text: whole });
    else if (slash) tokens.push({ kind: 'close', tag: name, source: whole });
    else {
      const open: Token = { kind: 'open', tag: name, source: whole };
      if (rawAttr !== undefined) open.attr = stripQuotes(rawAttr);
      tokens.push(open);
    }
  }
  if (cursor < source.length) tokens.push({ kind: 'text', text: source.slice(cursor) });

  // Pair opens with closes, per tag name, like brackets. Anything left unpaired is literal text.
  const pending = new Map<BBTag, number[]>();
  const paired = new Set<number>();
  tokens.forEach((token, i) => {
    if (token.kind === 'open') {
      const list = pending.get(token.tag) ?? [];
      list.push(i);
      pending.set(token.tag, list);
    } else if (token.kind === 'close') {
      const opener = pending.get(token.tag)?.pop();
      if (opener !== undefined) paired.add(opener).add(i);
    }
  });
  return tokens.map((token, i) =>
    token.kind === 'text' || paired.has(i) ? token : { kind: 'text', text: token.source },
  );
}

/** Parses BBCode into a tree of the recognised tags. A tag that never closes, or a closing tag with
 * nothing to close, is literal text. When tags overlap (`[b]a[i]b[/b]c[/i]`), closing the outer one
 * also closes the ones inside it and reopens them straight after, so the formatting still covers
 * the characters it was meant to. */
export function parseBBCode(source: string): BBNode[] {
  const root: TagNode = { kind: 'tag', tag: 'b', children: [] };
  const stack: TagNode[] = [root];
  const top = () => stack[stack.length - 1];

  for (const token of tokenize(source)) {
    if (token.kind === 'text') {
      top().children.push(token.text);
    } else if (token.kind === 'open') {
      const node: TagNode = { kind: 'tag', tag: token.tag, children: [] };
      if (token.attr !== undefined) node.attr = token.attr;
      top().children.push(node);
      stack.push(node);
    } else {
      // Paired, so an open node with this tag is on the stack.
      let depth = stack.length - 1;
      while (depth > 1 && stack[depth].tag !== token.tag) depth--;
      const interrupted = stack.splice(depth);
      interrupted.shift();
      for (const node of interrupted) {
        const reopened: TagNode = { ...node, children: [] };
        top().children.push(reopened);
        stack.push(reopened);
      }
    }
  }
  return mergeText(root.children);
}

function mergeText(nodes: BBNode[]): BBNode[] {
  const out: BBNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (typeof node === 'string' && typeof prev === 'string') out[out.length - 1] = prev + node;
    else if (typeof node === 'string') {
      if (node !== '') out.push(node);
    } else out.push({ ...node, children: mergeText(node.children) });
  }
  return out;
}

// --- BBCode -> DOM ---------------------------------------------------------------------------

/** A run of text with the tags around it, outermost first (identity matters: two separate
 * `[b]` pairs stay two separate <b> elements). */
interface Segment {
  text: string;
  marks: TagNode[];
}

function flatten(nodes: BBNode[], marks: TagNode[], lines: Segment[][]): void {
  for (const node of nodes) {
    if (typeof node === 'string') {
      const parts = node.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part !== '') lines[lines.length - 1].push({ text: part, marks });
      });
    } else if (node.tag === 'url' && node.attr === undefined) {
      // Bare [url]address[/url]: the address is its own label.
      const address = plainText(node.children);
      lines[lines.length - 1].push({
        text: address,
        marks: [...marks, { ...node, attr: address }],
      });
    } else {
      flatten(node.children, [...marks, node], lines);
    }
  }
}

function plainText(nodes: BBNode[]): string {
  return nodes.map((n) => (typeof n === 'string' ? n : plainText(n.children))).join('');
}

function createMarkElement(doc: Document, mark: TagNode): HTMLElement {
  if (mark.tag === 'url' || mark.tag === 'email') {
    const a = doc.createElement('a');
    const address = mark.attr ?? '';
    a.setAttribute('href', mark.tag === 'email' ? `mailto:${address}` : address);
    return a;
  }
  return doc.createElement(mark.tag);
}

function buildInline(doc: Document, segments: Segment[], depth: number, parent: Node): void {
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    const mark = seg.marks[depth];
    if (!mark) {
      parent.appendChild(doc.createTextNode(seg.text));
      i++;
      continue;
    }
    let j = i + 1;
    while (j < segments.length && segments[j].marks[depth] === mark) j++;
    const el = createMarkElement(doc, mark);
    buildInline(doc, segments.slice(i, j), depth + 1, el);
    parent.appendChild(el);
    i = j;
  }
}

/** Replaces `container`'s contents with editor DOM for `source`: a <div> per line, an empty line
 * holding just a <br> (the browser needs one to give the line height and a caret position). An
 * empty source leaves the container empty. */
export function renderBBCode(container: HTMLElement, source: string): void {
  const doc = container.ownerDocument;
  container.replaceChildren();
  const normalized = source.replace(/\r\n?/g, '\n');
  if (normalized === '') return;
  const lines: Segment[][] = [[]];
  flatten(parseBBCode(normalized), [], lines);
  for (const line of lines) {
    const div = doc.createElement('div');
    if (line.length === 0) div.appendChild(doc.createElement('br'));
    else buildInline(doc, line, 0, div);
    container.appendChild(div);
  }
}

// --- DOM -> BBCode ---------------------------------------------------------------------------

/** One open tag in the output; equal when tag and address match, so adjacent runs merge. */
interface Mark {
  tag: BBTag;
  attr?: string;
}

const sameMark = (a: Mark, b: Mark) => a.tag === b.tag && a.attr === b.attr;

const BLOCKS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);

const SKIPPED = new Set([
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'NOSCRIPT',
  'IMG',
  'IFRAME',
  'OBJECT',
  'VIDEO',
  'AUDIO',
]);

const SIMPLE: Record<string, BBTag> = {
  B: 'b',
  STRONG: 'b',
  I: 'i',
  EM: 'i',
  U: 'u',
  S: 's',
  STRIKE: 's',
  DEL: 's',
};

/** The formats an element switches on and off — by tag name and by inline style, since browsers
 * sometimes use a <span style> (and use `font-weight: normal` to un-bold inside bold). */
function formatsOf(el: Element): { on: Mark[]; off: BBTag[] } {
  const on: Mark[] = [];
  const off: BBTag[] = [];
  const simple = SIMPLE[el.tagName];
  if (simple) on.push({ tag: simple });
  if (el.tagName === 'A') {
    const href = (el.getAttribute('href') ?? '').trim();
    if (/^mailto:/i.test(href)) on.push({ tag: 'email', attr: href.slice('mailto:'.length) });
    else if (href !== '') on.push({ tag: 'url', attr: href });
  }
  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  if (style) {
    const weight = style.fontWeight;
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) on.push({ tag: 'b' });
    else if (weight === 'normal' || weight === 'lighter' || (weight !== '' && Number(weight) < 600))
      off.push('b');
    if (style.fontStyle === 'italic' || style.fontStyle === 'oblique') on.push({ tag: 'i' });
    else if (style.fontStyle === 'normal') off.push('i');
    const decoration = `${style.textDecoration} ${style.textDecorationLine}`;
    if (/underline/.test(decoration)) on.push({ tag: 'u' });
    if (/line-through/.test(decoration)) on.push({ tag: 's' });
    if (/\bnone\b/.test(decoration)) off.push('u', 's');
  }
  return { on, off };
}

class Writer {
  private out = '';
  private open: Mark[] = [];
  /** Lines started so far, and whether the current one can still take inline content. */
  private lines = 0;
  private lineOpen = false;
  private pendingNewlines = 0;

  /** Closes open tags down to the longest common prefix with `marks`; returns its length. */
  private closeTo(marks: Mark[]): number {
    let common = 0;
    while (
      common < this.open.length &&
      common < marks.length &&
      sameMark(this.open[common], marks[common])
    ) {
      common++;
    }
    while (this.open.length > common) this.out += `[/${this.open.pop()!.tag}]`;
    return common;
  }

  private startLine(): void {
    if (this.lines > 0) this.pendingNewlines++;
    this.lines++;
    this.lineOpen = true;
  }

  text(text: string, marks: Mark[]): void {
    if (text === '') return;
    if (!this.lineOpen) this.startLine();
    const common = this.closeTo(marks);
    // Newlines go in the deepest context the lines on both sides share.
    this.out += '\n'.repeat(this.pendingNewlines);
    this.pendingNewlines = 0;
    for (const mark of marks.slice(common)) {
      this.out += mark.attr === undefined ? `[${mark.tag}]` : `[${mark.tag}=${mark.attr}]`;
      this.open.push(mark);
    }
    this.out += text;
  }

  /** A <br>: ends the current line, first opening an (empty) one if there isn't one — so the
   * <br> that closes off a line with text is invisible, as in the browser, while a second one
   * makes an empty line. */
  lineBreak(): void {
    if (!this.lineOpen) this.startLine();
    this.lineOpen = false;
  }

  blockBoundary(): void {
    this.lineOpen = false;
  }

  finish(): string {
    this.closeTo([]);
    this.out += '\n'.repeat(this.pendingNewlines);
    return this.out;
  }
}

function walk(node: Node, marks: Mark[], writer: Writer): void {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const text = (node.nodeValue ?? '').replace(/ /g, ' ').replace(/[​﻿]/g, '');
    const parts = text.split(/\r\n?|\n/);
    parts.forEach((part, i) => {
      if (i > 0) writer.lineBreak();
      writer.text(part, marks);
    });
    return;
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
  const el = node as Element;
  if (SKIPPED.has(el.tagName)) return;
  if (el.tagName === 'BR') {
    writer.lineBreak();
    return;
  }

  const { on, off } = formatsOf(el);
  let next = marks.filter((m) => !off.includes(m.tag));
  for (const mark of on) {
    // A format already in force (bold inside bold, a link inside a link) adds nothing.
    const isLink = mark.tag === 'url' || mark.tag === 'email';
    const already = next.some(
      (m) => m.tag === mark.tag || (isLink && (m.tag === 'url' || m.tag === 'email')),
    );
    if (!already) next = [...next, mark];
  }

  const block = BLOCKS.has(el.tagName);
  if (block) writer.blockBoundary();
  for (const child of Array.from(el.childNodes)) walk(child, next, writer);
  if (block) writer.blockBoundary();
}

/** The BBCode for the editor's current contents (`root` itself is the editing surface, so its own
 * tag doesn't count). */
export function serializeBBCode(root: Node): string {
  const writer = new Writer();
  for (const child of Array.from(root.childNodes)) walk(child, [], writer);
  return writer.finish();
}
