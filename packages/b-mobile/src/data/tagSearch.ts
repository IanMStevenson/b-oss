// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/** Blipfoto's tag search only understands `#word` where word is letters, digits and underscore
 * (b-api docs, GET entries/search). A tag with a space, hyphen or other symbol can't be searched
 * for, so the Tag screen says so instead of reporting "no entries". */
export function isSearchableTag(tag: string): boolean {
  return /^\w+$/.test(tag.replace(/^#/, ''));
}
