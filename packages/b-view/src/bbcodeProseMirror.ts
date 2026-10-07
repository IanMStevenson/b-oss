// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// BBCode <-> ProseMirror document, for the model-based comment editor (b-oss#206 spike). Where the
// contenteditable editor (BBCodeEditor) treats the browser's DOM as the document, here
// ProseMirror's own model is the document and the DOM is just its view — including the formats
// for the next typed characters ("stored marks"), which the browser can't hold reliably.
//
// The schema is BBCode's shape and nothing more: a document of lines (one per `\n`), text, and the
// five marks. Parsing reuses bbcodeDom.ts's tested parser; writing follows the same rules as its
// DOM serializer (adjacent runs merge, newlines sit in the deepest shared tag, no escaping).

import { Schema, type Node as PMNode, type Mark } from 'prosemirror-model';
import { parseBBCodeLines, type BBTag } from './bbcodeDom.js';

export const bbcodeSchema = new Schema({
  nodes: {
    doc: { content: 'line+' },
    line: {
      content: 'text*',
      toDOM: () => ['div', 0],
      parseDOM: [{ tag: 'div' }, { tag: 'p' }],
    },
    text: {},
  },
  // Order matters: earlier marks wrap later ones, in the DOM and in the BBCode written.
  marks: {
    b: {
      toDOM: () => ['b', 0],
      parseDOM: [
        { tag: 'b' },
        { tag: 'strong' },
        { style: 'font-weight', getAttrs: (v) => /^(bold(er)?|[6-9]\d\d)$/.test(v) && null },
      ],
    },
    i: {
      toDOM: () => ['i', 0],
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    },
    u: {
      toDOM: () => ['u', 0],
      parseDOM: [{ tag: 'u' }],
    },
    s: {
      toDOM: () => ['s', 0],
      parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }],
    },
    link: {
      attrs: { address: {}, email: { default: false } },
      // Typing at the end of a link doesn't extend it.
      inclusive: false,
      toDOM: (mark) => {
        const { address, email } = mark.attrs as { address: string; email: boolean };
        return ['a', { href: email ? `mailto:${address}` : address }, 0];
      },
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => {
            const href = (dom).getAttribute('href') ?? '';
            return /^mailto:/i.test(href)
              ? { address: href.slice('mailto:'.length), email: true }
              : { address: href, email: false };
          },
        },
      ],
    },
  },
});

const { b, i, u, s, link } = bbcodeSchema.marks;

function markFor(tag: BBTag, attr: string | undefined): Mark {
  switch (tag) {
    case 'url':
      return link.create({ address: attr ?? '', email: false });
    case 'email':
      return link.create({ address: attr ?? '', email: true });
    default:
      return { b: b, i: i, u: u, s: s }[tag].create();
  }
}

/** The ProseMirror document for stored BBCode; an empty comment is one empty line. */
export function docFromBBCode(source: string): PMNode {
  const lines = parseBBCodeLines(source);
  if (lines.length === 0) lines.push([]);
  return bbcodeSchema.node(
    'doc',
    null,
    lines.map((runs) =>
      bbcodeSchema.node(
        'line',
        null,
        runs
          .filter((run) => run.text !== '')
          .map((run) =>
            bbcodeSchema.text(
              run.text,
              run.marks.reduce<readonly Mark[]>(
                (set, m) => markFor(m.tag, m.attr).addToSet(set),
                [],
              ),
            ),
          ),
      ),
    ),
  );
}

/** One open tag in the output; equal when tag and address match, so adjacent runs merge. */
interface OpenTag {
  tag: BBTag;
  attr?: string;
}

function tagFor(mark: Mark): OpenTag {
  if (mark.type === link) {
    const { address, email } = mark.attrs as { address: string; email: boolean };
    return { tag: email ? 'email' : 'url', attr: address };
  }
  return { tag: mark.type.name as BBTag };
}

const sameTag = (x: OpenTag, y: OpenTag) => x.tag === y.tag && x.attr === y.attr;

/** The BBCode for a document: lines joined by `\n`, marks as tags in schema order. */
export function bbcodeFromDoc(doc: PMNode): string {
  let out = '';
  const open: OpenTag[] = [];
  let pendingNewlines = 0;

  // Tags already open stay open while they still apply, whatever the schema's order, so
  // `[i]a [b]both[/b] b[/i]` isn't reshuffled into `[i]a [/i][b][i]both…`.
  const closeTo = (tags: OpenTag[]): OpenTag[] => {
    let keep = 0;
    while (keep < open.length && tags.some((t) => sameTag(t, open[keep]))) keep++;
    while (open.length > keep) out += `[/${open.pop()!.tag}]`;
    return tags.filter((t) => !open.some((o) => sameTag(o, t)));
  };

  doc.forEach((line, _offset, index) => {
    if (index > 0) pendingNewlines++;
    line.forEach((textNode) => {
      const text = textNode.text ?? '';
      if (text === '') return;
      const toOpen = closeTo(textNode.marks.map(tagFor));
      out += '\n'.repeat(pendingNewlines);
      pendingNewlines = 0;
      for (const tag of toOpen) {
        out += tag.attr === undefined ? `[${tag.tag}]` : `[${tag.tag}=${tag.attr}]`;
        open.push(tag);
      }
      out += text;
    });
  });
  closeTo([]);
  return out + '\n'.repeat(pendingNewlines);
}
