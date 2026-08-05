// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Renders BBCode via @bbob/react — no dangerouslySetInnerHTML anywhere, which is the
// security-relevant property of parsing to React elements rather than an HTML string. Link
// clicks are intercepted at the container level (rather than relying on bbob's tag processor to
// carry a React event handler) so a host can redirect navigation (e.g. Capacitor's system-browser
// open) without this component knowing anything about the host platform.
//
// Blipfoto's own rendered `_html` output wraps blank-line-separated blocks of raw source in <p>
// elements (confirmed against b-api's fixtures); the raw BBCode source itself carries no such
// markup. Splitting on blank lines here restores that paragraph structure — real <p> elements,
// not a plain-text blob — so multi-paragraph descriptions/comments don't lose their breaks now
// that rendering has moved off dangerouslySetInnerHTML(description_html/content_html). Single
// line breaks within a paragraph are preserved via `white-space: pre-line` rather than manual
// <br> insertion, keeping @bbob free to parse each paragraph as a plain string.

import type { MouseEvent } from 'react';
import BBCode from '@bbob/react';
import { bbcodePreset, BBCODE_TAGS } from '../bbcode.js';

interface BBCodeTextProps {
  source: string;
  className?: string;
  onLinkClick?: (href: string) => void;
}

function defaultLinkClick(href: string): void {
  window.open(href, '_blank', 'noopener,noreferrer');
}

function splitParagraphs(source: string): string[] {
  return source
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function BBCodeText({ source, className, onLinkClick }: BBCodeTextProps) {
  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href');
    if (href) (onLinkClick ?? defaultLinkClick)(href);
  }

  const paragraphs = splitParagraphs(source);
  if (paragraphs.length === 0) return null;

  return (
    <div className={className} onClick={handleClick}>
      {paragraphs.map((paragraph, i) => (
        <p key={i} style={{ whiteSpace: 'pre-line' }}>
          <BBCode plugins={[bbcodePreset()]} options={{ onlyAllowTags: [...BBCODE_TAGS] }}>
            {paragraph}
          </BBCode>
        </p>
      ))}
    </div>
  );
}
