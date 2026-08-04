// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// jsdom has no scroll implementation (https://github.com/jsdom/jsdom/issues/1695); Ionic
// components that scroll their active item into view (ion-segment, ion-content) throw without
// this. Only runs under jsdom — pure-logic test files using the default node environment never
// see `Element`.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
