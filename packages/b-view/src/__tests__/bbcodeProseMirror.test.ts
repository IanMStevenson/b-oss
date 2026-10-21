// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { bbcodeSchema, docFromBBCode, bbcodeFromDoc } from '../bbcodeProseMirror.js';

const roundTrip = (source: string) => bbcodeFromDoc(docFromBBCode(source));

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
    ['[quote]x[/quote]', '[quote]x[/quote]'],
    ['a [ b ] c [] [/]', 'a [ b ] c [] [/]'],
    ['[b]never closed', '[b]never closed'],
    ['stray close[/i]', 'stray close[/i]'],
    ['[B]x[/B] [I]y[/i]', '[b]x[/b] [i]y[/i]'],
    ['[url]example.com[/url]', '[url=example.com]example.com[/url]'],
    ['[url="https://x.org"]q[/url]', '[url=https://x.org]q[/url]'],
    ['[b]a[i]b[/b]c[/i]', '[b]a[i]b[/i][/b][i]c[/i]'],
    ['[b]a[/b][b]b[/b]', '[b]ab[/b]'],
    ['x[i][/i]y[b][/b]', 'xy'],
    // Tags opened together come out in the schema's order (the same formatting either way).
    ['[s][u][i][b]reversed[/b][/i][/u][/s]', '[b][i][u][s]reversed[/s][/u][/i][/b]'],
    ['[b][/b]', ''],
    ['[url][/url]', ''],
    ['a\r\nb\rc', 'a\nb\nc'],
  ])('%j -> %j', (source, expected) => {
    expect(roundTrip(source)).toBe(expected);
  });
});

describe('docFromBBCode', () => {
  it('makes a line per \\n, an empty comment being one empty line', () => {
    expect(docFromBBCode('').childCount).toBe(1);
    const doc = docFromBBCode('a\n\nb');
    expect(doc.childCount).toBe(3);
    expect(doc.child(1).content.size).toBe(0);
  });

  it('turns tags into marks, and [url]/[email] into link marks', () => {
    const doc = docFromBBCode('[b][url=https://x.org]x[/url][/b][email=a@b.co]me[/email]');
    const [first, second] = [doc.child(0).child(0), doc.child(0).child(1)];
    expect(first.marks.map((m) => m.type.name)).toEqual(['b', 'link']);
    expect(first.marks[1].attrs).toEqual({ address: 'https://x.org', email: false });
    expect(second.marks[0].attrs).toEqual({ address: 'a@b.co', email: true });
  });
});

describe('bbcodeFromDoc', () => {
  const { b, i, u } = bbcodeSchema.marks;
  const line = (...nodes: ReturnType<typeof bbcodeSchema.text>[]) =>
    bbcodeSchema.node('line', null, nodes);

  it('keeps tags open across runs that share them, whatever their order', () => {
    const doc = bbcodeSchema.node('doc', null, [
      line(
        bbcodeSchema.text('a', [b.create()]),
        bbcodeSchema.text('b', [b.create(), i.create()]),
        bbcodeSchema.text('c', [i.create(), u.create()]),
      ),
    ]);
    expect(bbcodeFromDoc(doc)).toBe('[b]a[i]b[/i][/b][i][u]c[/u][/i]');
  });

  it('puts a line break inside a tag both lines share', () => {
    const doc = bbcodeSchema.node('doc', null, [
      line(bbcodeSchema.text('a', [b.create()])),
      line(bbcodeSchema.text('b', [b.create()])),
    ]);
    expect(bbcodeFromDoc(doc)).toBe('[b]a\nb[/b]');
  });
});
