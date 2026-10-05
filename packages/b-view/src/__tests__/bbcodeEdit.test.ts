// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { wrapWithTag, insertLink } from '../bbcodeEdit.js';

describe('wrapWithTag', () => {
  it('wraps the selection and keeps it selected so formats can be stacked', () => {
    const r = wrapWithTag('say hello there', 4, 9, 'b');
    expect(r.value).toBe('say [b]hello[/b] there');
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe('hello');
  });

  it('with nothing selected, inserts an empty pair with the caret between the tags', () => {
    const r = wrapWithTag('ab', 1, 1, 'i');
    expect(r.value).toBe('a[i][/i]b');
    expect(r.selectionStart).toBe(4);
    expect(r.selectionEnd).toBe(4);
  });

  it('works at the very start and end of the text', () => {
    expect(wrapWithTag('hi', 0, 2, 'u').value).toBe('[u]hi[/u]');
    expect(wrapWithTag('hi', 2, 2, 's').value).toBe('hi[s][/s]');
  });

  it('stacks: wrapping an already-wrapped selection nests the tags', () => {
    const bold = wrapWithTag('word', 0, 4, 'b');
    const both = wrapWithTag(bold.value, bold.selectionStart, bold.selectionEnd, 'i');
    expect(both.value).toBe('[b][i]word[/i][/b]');
  });

  it('is multi-line safe', () => {
    expect(wrapWithTag('one\ntwo', 0, 7, 'b').value).toBe('[b]one\ntwo[/b]');
  });
});

describe('insertLink', () => {
  it('turns the selection into the label of a link to the address', () => {
    const r = insertLink('see this page now', 4, 13, 'https://example.com');
    expect(r.value).toBe('see [url=https://example.com]this page[/url] now');
    expect(r.selectionStart).toBe(r.value.indexOf('[/url]') + '[/url]'.length);
  });

  it('with nothing selected, the address labels itself', () => {
    const r = insertLink('visit ', 6, 6, 'example.com');
    expect(r.value).toBe('visit [url]example.com[/url]');
    expect(r.selectionStart).toBe(r.value.length);
  });

  it('trims the address, and an empty one changes nothing', () => {
    expect(insertLink('x', 0, 1, '  https://a.b  ').value).toBe('[url=https://a.b]x[/url]');
    expect(insertLink('x', 0, 1, '   ')).toEqual({
      value: 'x',
      selectionStart: 0,
      selectionEnd: 1,
    });
  });
});
