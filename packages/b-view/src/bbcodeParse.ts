// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Parsing stored BBCode for the rich comment editor (b-oss#206). Every recognised tag pair becomes
// formatting, however it got there, so a tag someone typed by hand turns into real formatting the
// next time the comment is edited: the editor never scans what's being typed, but always parses
// what it loads. That matches blipfoto.com. Unknown tags, stray brackets and tags that never pair
// up stay as literal text.
//
// Pure string-in, data-out: the editor (bbcodeProseMirror.ts) turns the result into its document.

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
function parseBBCode(source: string): BBNode[] {
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

/** A run of text with the tags around it, outermost first. */
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

/** A run of text and its formatting, outermost first — the DOM-free view of parsed BBCode. */
export interface BBRun {
  text: string;
  marks: { tag: BBTag; attr?: string }[];
}

/** Parses BBCode into lines of formatted runs (an empty line is an empty array; an empty source
 * has no lines). For editors that keep their own document model rather than the DOM. */
export function parseBBCodeLines(source: string): BBRun[][] {
  const normalized = source.replace(/\r\n?/g, '\n');
  if (normalized === '') return [];
  const lines: Segment[][] = [[]];
  flatten(parseBBCode(normalized), [], lines);
  return lines.map((line) =>
    line.map((seg) => ({
      text: seg.text,
      marks: seg.marks.map((m) =>
        m.attr === undefined ? { tag: m.tag } : { tag: m.tag, attr: m.attr },
      ),
    })),
  );
}
