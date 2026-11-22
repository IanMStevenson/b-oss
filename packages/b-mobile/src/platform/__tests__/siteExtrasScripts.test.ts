// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  buildAddExtrasScript,
  buildReadBackScript,
  buildRemainingScript,
  buildWhoAmIScript,
  editPageUrl,
} from '../siteExtrasScripts.js';

describe('page scripts', () => {
  it('are syntactically valid JavaScript', () => {
    const files = [{ name: 'a.jpg', mimeType: 'image/jpeg', base64: 'QUJD' }];
    for (const script of [
      buildAddExtrasScript(files),
      buildReadBackScript(),
      buildWhoAmIScript(),
      buildRemainingScript(),
    ]) {
      expect(() => new Script(script)).not.toThrow();
    }
  });

  it('carry the photos as data, not as code', () => {
    const script = buildAddExtrasScript([
      { name: '"; alert(1); "', mimeType: 'image/jpeg', base64: 'QUJD' },
    ]);
    expect(() => new Script(script)).not.toThrow();
    expect(script).toContain(JSON.stringify('"; alert(1); "'));
  });

  it('only ever names the site own edit page', () => {
    expect(editPageUrl('123')).toBe('https://www.blipfoto.com/entry/123/edit');
    expect(editPageUrl('../x')).not.toContain('/../');
  });
});
