// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// native-licences.generated.json is produced from a Gradle run that CI can't do, so these check
// its shape and the report conversion rather than that it is current with the Gradle classpath.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildNativeLicences, OUT_PATH } from './native-licences.mjs';

const generated = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));

describe('native-licences.generated.json', () => {
  it('gives every artifact at least one licence that exists', () => {
    expect(generated.artifacts.length).toBeGreaterThan(0);
    for (const a of generated.artifacts) {
      expect(a.licences.length, a.name).toBeGreaterThan(0);
      for (const i of a.licences) expect(generated.licences[i], a.name).toBeDefined();
    }
  });

  it('bundles full text for every licence and names the Ionic libraries as MIT', () => {
    for (const l of generated.licences) expect(l.text, l.id).toBeTruthy();
    const mit = generated.licences.findIndex((l) => l.id === 'MIT');
    const ionic = generated.artifacts.filter((a) => a.name.startsWith('io.ionic.libs:'));
    expect(ionic.length).toBeGreaterThan(0);
    for (const a of ionic) expect(a.licences, a.name).toEqual([mit]);
    expect(generated.licences.some((l) => l.name === 'License')).toBe(false);
  });

  it('carries the Apache-2.0 text and a link or text for every licence', () => {
    const apache = generated.licences.find((l) => l.id === 'Apache-2.0');
    expect(apache?.text).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION');
    for (const l of generated.licences) expect(l.text ?? l.url, l.id).toBeTruthy();
  });

  it('includes the AndroidX, Kotlin and Firebase libraries the app ships', () => {
    const names = new Set(generated.artifacts.map((a) => a.name));
    for (const n of [
      'androidx.core:core',
      'org.jetbrains.kotlin:kotlin-stdlib',
      'com.google.firebase:firebase-messaging',
    ]) {
      expect(names.has(n), n).toBe(true);
    }
  });
});

describe('buildNativeLicences', () => {
  const report = [
    {
      group: 'b',
      name: 'two',
      version: '2',
      licences: [{ name: 'The Apache Software License, Version 2.0', url: 'http://x' }],
    },
    {
      group: 'a',
      name: 'one',
      version: '1',
      licences: [
        { name: 'Apache-2.0', url: 'http://y' },
        { name: 'Weird', url: 'http://w' },
      ],
    },
  ];

  it('merges differently-worded Apache names, keeps unknown licences by URL, and sorts', () => {
    const out = buildNativeLicences(report, 'APACHE TEXT');
    expect(out.licences.map((l) => l.id)).toEqual(['Apache-2.0', 'http://w']);
    expect(out.licences[0].text).toBe('APACHE TEXT');
    expect(out.licences[1].text).toBeNull();
    expect(out.artifacts).toEqual([
      { name: 'a:one', version: '1', licences: [0, 1] },
      { name: 'b:two', version: '2', licences: [0] },
    ]);
  });

  it('matches URL-only licences, attaches texts and carries NOTICE files', () => {
    const out = buildNativeLicences(
      [
        {
          group: 'io.ionic.libs',
          name: 'x',
          version: '1',
          licences: [{ name: 'License', url: 'https://github.com/ionic-team/x/blob/main/LICENSE' }],
          notices: [{ path: 'META-INF/NOTICE', text: 'N' }],
        },
      ],
      '',
      { MIT: 'MIT TEXT' },
    );
    expect(out.licences[0]).toMatchObject({ id: 'MIT', text: 'MIT TEXT' });
    expect(out.artifacts[0].notices).toEqual([{ path: 'META-INF/NOTICE', text: 'N' }]);
  });

  it('stops on an artifact whose POM declares no licence', () => {
    expect(() =>
      buildNativeLicences([{ group: 'g', name: 'n', version: '1', licences: [] }], ''),
    ).toThrow(/g:n:1/);
  });
});
