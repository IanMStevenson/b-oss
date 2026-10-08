// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The BBCode preset — exactly the supported tags (the five toolbar ones, plus [email]), nothing else. Unknown tags aren't given a
// processor here, which is what makes @bbob leave them as their literal source text rather than
// dropping them — nothing should silently disappear from someone's description or comment.
// Consumed by BBCodeText, which renders to real React elements rather than dangerouslySetInnerHTML.

import { createPreset } from '@bbob/preset';
import { TagNode, getUniqAttr, isStringNode } from '@bbob/plugin-helper';
import type { TagNodeObject, TagNodeTree, NodeContent } from '@bbob/types';

function toArray(content: TagNodeTree | undefined): NodeContent[] {
  if (content == null) return [];
  return Array.isArray(content) ? content : [content];
}

function contentText(content: TagNodeTree | undefined): string {
  return toArray(content).filter(isStringNode).map(String).join('');
}

// [url] behaviour beyond wrapping: a URL with no scheme gets http:// prepended, an email-looking
// target becomes mailto:, and a bare [url] uses its own target as the label. Only http:, https:
// and mailto: targets become links; any other scheme (javascript:, data:, vbscript:, file:, ...)
// returns null and the caller renders the label as plain text. Browsers ignore tabs/newlines and
// leading control chars/spaces when parsing a URL ("java\tscript:" is javascript:), so those are
// stripped before the scheme is checked.
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

function normalizeUrl(rawTarget: string): string | null {
  const target = rawTarget.replace(
    /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060\ufeff]/g,
    '',
  );
  if (target === '') return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(target);
  // "example.com:8080/path" is a host and port, not a scheme.
  const hostPort = /^[^/?#:@]+:\d+(?:[/?#]|$)/.test(target);
  if (scheme && !hostPort) return ALLOWED_SCHEMES.includes(scheme[1].toLowerCase()) ? target : null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return `mailto:${target}`;
  return `http://${target}`;
}

function urlTag(node: TagNodeObject): TagNodeObject {
  const attrTarget = getUniqAttr(node.attrs);
  const isBare = typeof attrTarget !== 'string';
  const rawTarget = isBare ? contentText(node.content) : attrTarget;
  const href = normalizeUrl(rawTarget);
  const label = isBare ? [rawTarget] : toArray(node.content);
  return href === null ? TagNode.create('span', {}, label) : TagNode.create('a', { href }, label);
}

// [email=address]label[/email] (or bare [email]address[/email]) — blipfoto.com's mailto form of
// [url], which its comment editor writes for an email link (b-oss#206).
function emailTag(node: TagNodeObject): TagNodeObject {
  const attrTarget = getUniqAttr(node.attrs);
  const isBare = typeof attrTarget !== 'string';
  const address = (isBare ? contentText(node.content) : attrTarget).replace(/^mailto:/i, '');
  const label = isBare ? [address] : toArray(node.content);
  return TagNode.create('a', { href: `mailto:${address}` }, label);
}

function simpleTag(tag: string) {
  return (node: TagNodeObject): TagNodeObject => TagNode.create(tag, {}, toArray(node.content));
}

// The allow-list itself, not just which tags have a processor — passed to @bbob's parser as
// `onlyAllowTags` so an unrecognized tag is left as literal source text at the parse stage rather
// than becoming a bogus HTML element (@bbob/react's default for any parsed-but-unprocessed tag is
// to render it as a same-named HTML element, which is not what we want).
export const BBCODE_TAGS = ['b', 'i', 'u', 's', 'url'] as const;

/** What's rendered: BBCODE_TAGS (the ones toolbars offer) plus `email`, which only arrives from
 * blipfoto.com's own editor or ours (an email link) and has no toolbar button of its own. */
export const RENDERED_BBCODE_TAGS = [...BBCODE_TAGS, 'email'] as const;

export const bbcodePreset = createPreset({
  b: simpleTag('b'),
  i: simpleTag('i'),
  u: simpleTag('u'),
  s: simpleTag('s'),
  url: urlTag,
  email: emailTag,
});

// Tags blipfoto.com or other BBCode dialects commonly emit that we don't render. They're stripped
// (keeping their inner text) so a reader never sees raw brackets for markup — see normalizeBBCode.
const KNOWN_UNRENDERED_TAGS = [
  'img', 'quote', 'color', 'colour', 'size', 'font', 'center', 'centre', 'left', 'right', 'justify',
  'code', 'pre', 'list', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'youtube', 'video', 'spoiler',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'sup', 'sub', 'strike', 'br', 'hr', 'p',
]; // prettier-ignore

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Makes comment/description/notification text safe for the single BBCode renderer: tag names are
 * lower-cased (`[B]`, `[URL=...]`), the five common HTML entities some API payloads carry are
 * decoded (the renderer escapes on output), and tags we don't render are removed leaving their
 * inner text — `[quote]hi[/quote]` reads "hi", `[img]http://…[/img]` reads as the URL — instead of
 * showing raw brackets. Square brackets that aren't a tag at all (`[sic]`, `[1]`) are left alone:
 * an unknown open tag is only stripped when it has a matching close, or is a known BBCode name.
 */
export function normalizeBBCode(source: string): string {
  let text = source.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi,
    (m) => HTML_ENTITIES[m.toLowerCase()] ?? m,
  );
  const rendered = RENDERED_BBCODE_TAGS.join('|');
  text = text.replace(
    new RegExp(`\\[(/?)(${rendered})(?=[\\]=\\s])`, 'gi'),
    (_m, slash: string, name: string) => `[${slash}${name.toLowerCase()}`,
  );
  // Generic unknown tags: strip pairs, then stray known-dialect tags.
  const openRe = /\[([a-z][a-z0-9]*)(?:[= ][^\]]*)?\]/gi;
  const names = new Set<string>();
  for (const m of text.matchAll(openRe)) names.add(m[1].toLowerCase());
  for (const name of names) {
    if ((RENDERED_BBCODE_TAGS as readonly string[]).includes(name)) continue;
    const known = KNOWN_UNRENDERED_TAGS.includes(name);
    const n = escapeRegExp(name);
    const closeRe = new RegExp(`\\[/${n}\\]`, 'i');
    if (!known && !closeRe.test(text)) continue;
    text = text
      .replace(new RegExp(`\\[${n}(?:[= ][^\\]]*)?\\]`, 'gi'), '')
      .replace(new RegExp(`\\[/${n}\\]`, 'gi'), '');
  }
  return text.replace(/\[\*\]/g, '• ');
}
