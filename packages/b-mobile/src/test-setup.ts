// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach } from 'vitest';
import { configure } from '@testing-library/react';
import { resumeClear } from './data/resumeCache.js';

// The resume cache (b-oss#182) is module-level on purpose — it has to outlive a screen's unmount —
// so without this, whatever one test left remembered (a visited tab, a loaded feed) would leak
// into the next test's "fresh" mount.
beforeEach(() => resumeClear());

// jsdom has no scroll implementation (https://github.com/jsdom/jsdom/issues/1695); Ionic
// components that scroll their active item into view (ion-segment, ion-content) throw without
// this. Only runs under jsdom — pure-logic test files using the default node environment never
// see `Element`.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom in this repo's version has no built-in ResizeObserver; b-view's ThumbnailGrid (rendered
// by several b-mobile screens as of the b-view-reuse adoption) uses one to measure its container
// for column/row sizing — unmeasured falls back to a fixed 2x2 grid, fine for these tests. Same
// stub as b-view's own ThumbnailGrid.test.tsx, just shared here since many screens pull it in.
if (typeof ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}

// findBy*/waitFor give up after 1s by default — too tight for a loaded (or Windows) CI runner
// rendering Ionic screens, where it produced "Unable to find…" failures that pass on a quiet
// machine (b-oss#221). A larger ceiling doesn't slow tests that succeed: they resolve as soon as
// the condition holds. Only meaningful under jsdom.
if (typeof document !== 'undefined') configure({ asyncUtilTimeout: 5000 });

// ProseMirror (the comment editor, b-oss#206) measures the DOM to map coordinates and scroll the
// caret into view; jsdom has no layout, so give it empty geometry.
if (typeof document !== 'undefined') {
  const noRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
  const emptyRect = () => new DOMRect(0, 0, 0, 0);
  const stub = (target: object, name: string, value: unknown) => {
    if (!(name in target)) Object.defineProperty(target, name, { value, configurable: true });
  };
  stub(Range.prototype, 'getClientRects', noRects);
  stub(Range.prototype, 'getBoundingClientRect', emptyRect);
  stub(Element.prototype, 'getClientRects', noRects);
  stub(document, 'elementFromPoint', () => null);
}
