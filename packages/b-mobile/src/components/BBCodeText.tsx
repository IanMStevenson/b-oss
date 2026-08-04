// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Renders BBCode via @bbob/react (§14) — no dangerouslySetInnerHTML anywhere, which is the
// security-relevant property of parsing to React elements rather than an HTML string. Link
// clicks are intercepted at the container level (rather than relying on bbob's tag processor to
// carry a React event handler) so a tap never navigates the WebView itself away from the app
// (rules.md, §14): everything currently opens via platform/browser.ts's system-browser path.
// TODO(Phase 3+ deep-link resolver, §16): a blipfoto.com link that maps to a screen should
// instead open in-app through that resolver, once it exists.

import type { MouseEvent } from 'react';
import BBCode from '@bbob/react';
import { bbcodePreset, BBCODE_TAGS } from '../data/bbcode.js';
import { openUrl } from '../platform/browser.js';

interface BBCodeTextProps {
  source: string;
  className?: string;
}

export function BBCodeText({ source, className }: BBCodeTextProps) {
  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href');
    if (href) void openUrl(href);
  }

  return (
    <div className={className} onClick={handleClick}>
      <BBCode plugins={[bbcodePreset()]} options={{ onlyAllowTags: [...BBCODE_TAGS] }}>
        {source}
      </BBCode>
    </div>
  );
}
