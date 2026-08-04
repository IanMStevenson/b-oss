// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The BBCode preset (§14) — exactly the five supported tags, nothing else. Unknown tags aren't
// given a processor here, which is what makes @bbob leave them as their literal source text
// rather than dropping them (the spec's explicit requirement — nothing should silently
// disappear from someone's description). Rendering only; the editor toolbar is Phase 7's job
// (SCR-11), this module is reused there for its preset, not rebuilt.

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

// [url] behaviour beyond wrapping (§14): a URL with no scheme gets http:// prepended, an
// email-looking target becomes mailto:, and a bare [url] uses its own target as the label.
function normalizeUrl(target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return `mailto:${target}`;
  return `http://${target}`;
}

function urlTag(node: TagNodeObject): TagNodeObject {
  const attrTarget = getUniqAttr(node.attrs);
  const isBare = typeof attrTarget !== 'string';
  const rawTarget = isBare ? contentText(node.content) : attrTarget;
  const href = normalizeUrl(rawTarget);
  const label = isBare ? [rawTarget] : toArray(node.content);
  return TagNode.create('a', { href }, label);
}

function simpleTag(tag: string) {
  return (node: TagNodeObject): TagNodeObject => TagNode.create(tag, {}, toArray(node.content));
}

// The allow-list itself, not just which tags have a processor — passed to @bbob's parser as
// `onlyAllowTags` so an unrecognized tag is left as literal source text at the parse stage
// rather than becoming a bogus HTML element (@bbob/react's default for any parsed-but-
// unprocessed tag is to render it as a same-named HTML element, which is not what §14 wants).
export const BBCODE_TAGS = ['b', 'i', 'u', 's', 'url'] as const;

export const bbcodePreset = createPreset({
  b: simpleTag('b'),
  i: simpleTag('i'),
  u: simpleTag('u'),
  s: simpleTag('s'),
  url: urlTag,
});
