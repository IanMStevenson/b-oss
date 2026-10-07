// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { renderBBCode, serializeBBCode } from '../bbcodeDom.js';

/** BBCode -> editor DOM -> BBCode, as happens when a comment is opened for editing and saved. */
function roundTrip(source: string): string {
  const box = document.createElement('div');
  renderBBCode(box, source);
  return serializeBBCode(box);
}

function rendered(source: string): string {
  const box = document.createElement('div');
  renderBBCode(box, source);
  return box.innerHTML;
}

/** Serialises a DOM shaped like whatever the browser built while the user typed. */
function fromHtml(html: string): string {
  const box = document.createElement('div');
  box.innerHTML = html;
  return serializeBBCode(box);
}

describe('round trip: canonical BBCode comes back unchanged', () => {
  it.each([
    '',
    'hello',
    'a\nb',
    'a\n\nb',
    'a\n\n\nb',
    '\na',
    'a\n',
    'a\n\n',
    'two  spaces and   three',
    ' leading and trailing ',
    '[b]bold[/b] plain',
    '[i]italic[/i] [u]under[/u] [s]struck[/s]',
    '[i]a [b]both[/b] b[/i]',
    '[b][i][u][s]all four[/s][/u][/i][/b]',
    '[url=https://example.com]a link[/url]',
    'see [url=https://example.com/a?b=c&d=e#f]this[/url], ok',
    '[b]bold [url=https://x.org]link[/url] bold[/b]',
    '[url=https://x.org]link [b]bold[/b][/url]',
    '[email=me@example.com]write to me[/email]',
    '[b]a\nb[/b]',
    '[b]a\n\nb[/b]',
    '[b]one[/b]\n[i]two[/i]',
    '<script>alert(1)</script> & &amp; "quotes"',
    'emoji 🌿 and accents — café',
  ])('%j', (source) => {
    expect(roundTrip(source)).toBe(source);
  });
});

describe('round trip: hand-typed tags become formatting, everything else stays literal', () => {
  it.each([
    // Unknown tags, stray brackets and malformed tags are just text.
    ['[quote]x[/quote]', '[quote]x[/quote]'],
    ['a [ b ] c [] [/]', 'a [ b ] c [] [/]'],
    ['[b]never closed', '[b]never closed'],
    ['stray close[/i]', 'stray close[/i]'],
    ['[b=x]attr on b[/b]', '[b=x]attr on b[/b]'],
    ['[url=x]closed wrong[/b]', '[url=x]closed wrong[/b]'],
    // Pairs match like brackets, so the extra opener is the literal one.
    ['[b]one[b]two[/b]', '[b]one[b]two[/b]'],
    // Tag names are case-insensitive, and come back lower-case.
    ['[B]x[/B] [I]y[/i]', '[b]x[/b] [i]y[/i]'],
    // The bare [url] form gains its address; quoted addresses lose the quotes.
    ['[url]example.com[/url]', '[url=example.com]example.com[/url]'],
    ['[url="https://x.org"]q[/url]', '[url=https://x.org]q[/url]'],
    // Overlapping tags are split so each character keeps the formatting it had.
    ['[b]a[i]b[/b]c[/i]', '[b]a[i]b[/i][/b][i]c[/i]'],
    // Adjacent runs of the same format merge; empty ones disappear.
    ['[b]a[/b][b]b[/b]', '[b]ab[/b]'],
    ['x[i][/i]y[b][/b]', 'xy'],
    ['[b][/b]', ''],
    // Windows line endings.
    ['a\r\nb\rc', 'a\nb\nc'],
  ])('%j -> %j', (source, expected) => {
    expect(roundTrip(source)).toBe(expected);
  });

  it('a nested pair inside an unclosed one still formats', () => {
    expect(roundTrip('[b]one[i]two[/i]')).toBe('[b]one[i]two[/i]');
    expect(rendered('[b]one[i]two[/i]')).toBe('<div>[b]one<i>two</i></div>');
  });
});

describe('renderBBCode: the editor DOM', () => {
  it('makes a <div> per line and a <br> for an empty line', () => {
    expect(rendered('a\n\nb')).toBe('<div>a</div><div><br></div><div>b</div>');
  });

  it('leaves the box empty for an empty comment', () => {
    expect(rendered('')).toBe('');
  });

  it('uses <b>/<i>/<u>/<s>, the elements the browser itself makes', () => {
    expect(rendered('[b]1[/b][i]2[/i][u]3[/u][s]4[/s]')).toBe(
      '<div><b>1</b><i>2</i><u>3</u><s>4</s></div>',
    );
  });

  it('carries formatting across lines by repeating it on each line', () => {
    expect(rendered('[b]a\nb[/b]')).toBe('<div><b>a</b></div><div><b>b</b></div>');
  });

  it('makes links real anchors, with mailto: for [email]', () => {
    expect(rendered('[url=https://x.org]x[/url]')).toBe('<div><a href="https://x.org">x</a></div>');
    expect(rendered('[email=a@b.co]me[/email]')).toBe('<div><a href="mailto:a@b.co">me</a></div>');
  });

  it('puts text in as text, never as markup', () => {
    const box = document.createElement('div');
    renderBBCode(box, '<img src=x onerror=alert(1)>');
    expect(box.querySelector('img')).toBeNull();
    expect(box.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('serializeBBCode: DOM the browser builds while typing', () => {
  it.each([
    // Enter in Chrome: the first line is bare text, later lines are <div>s.
    ['a<div>b</div>', 'a\nb'],
    ['a<div><br></div><div>b</div>', 'a\n\nb'],
    ['<div>a</div><div>b</div>', 'a\nb'],
    ['<p>a</p><p>b</p>', 'a\nb'],
    // The <br> that ends a line with text in it is invisible; a second one is an empty line.
    ['<div>a<br></div>', 'a'],
    ['a<br>', 'a'],
    ['a<br><br>', 'a\n'],
    ['a<br>b', 'a\nb'],
    ['<div><br></div>', ''],
    ['<br>', ''],
    ['<div><br></div><div><br></div>', '\n'],
    // Every spelling of each format.
    [
      '<strong>b</strong><em>i</em><u>u</u><strike>s</strike><del>d</del>',
      '[b]b[/b][i]i[/i][u]u[/u][s]sd[/s]',
    ],
    ['<span style="font-weight: bold">x</span>', '[b]x[/b]'],
    ['<span style="font-weight: 700">x</span>', '[b]x[/b]'],
    ['<span style="font-style: italic">x</span>', '[i]x[/i]'],
    ['<span style="text-decoration: underline line-through">x</span>', '[u][s]x[/s][/u]'],
    // Un-bolding part of a bold run with a style.
    ['<b>a<span style="font-weight: normal">b</span>c</b>', '[b]a[/b]b[b]c[/b]'],
    // A format already in force adds nothing.
    ['<b>a<strong>b</strong></b>', '[b]ab[/b]'],
    ['<b>a</b><b>b</b>', '[b]ab[/b]'],
    ['<b></b>x<i></i>', 'x'],
    // Formatting over a line break, and an empty line inside it.
    ['<div><b>a</b></div><div><b>b</b></div>', '[b]a\nb[/b]'],
    ['<b>a<br>b</b>', '[b]a\nb[/b]'],
    ['<b>a</b><div><br></div>', '[b]a[/b]\n'],
    // Links.
    ['<a href="https://x.org">x</a>', '[url=https://x.org]x[/url]'],
    ['<a href="mailto:a@b.co">me</a>', '[email=a@b.co]me[/email]'],
    ['<b><a href="https://x.org">y</a></b>', '[b][url=https://x.org]y[/url][/b]'],
    [
      '<a href="https://x.org">a<a href="https://y.org">b</a></a>',
      '[url=https://x.org]a[/url][url=https://y.org]b[/url]',
    ],
    ['<a href="https://x.org"></a>gone', 'gone'],
    ['<a name="anchor">plain</a>', 'plain'],
    // Spaces the browser stores as &nbsp;, and invisible caret helpers.
    ['a&nbsp;&nbsp;b&nbsp;', 'a  b '],
    ['a​b﻿', 'ab'],
    // Text with literal newlines (white-space: pre-wrap) still breaks lines.
    ['a\nb', 'a\nb'],
    // Things with no BBCode keep their text (or vanish if they have none).
    ['<span class="x" style="color: red">red</span> <font face="Arial">font</font>', 'red font'],
    ['<img src="x.jpg">a<script>bad()</script><style>p{}</style>', 'a'],
    ['<ul><li>one</li><li>two</li></ul>', 'one\ntwo'],
    // Brackets typed as text are never escaped.
    ['[b]typed[/b]', '[b]typed[/b]'],
  ])('%j -> %j', (html, expected) => {
    expect(fromHtml(html)).toBe(expected);
  });
});
