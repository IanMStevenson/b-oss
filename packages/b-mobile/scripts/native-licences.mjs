// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The native Android half of the in-app "Open source licences" page's data (SCR-29): the Gradle
// libraries (AndroidX, Kotlin, Firebase / Play services, Ionic's native libs, ...) that scripts/
// licences.mjs can't see because they aren't npm packages.
//
// Unlike licences.mjs this is NOT part of `npm run build`: resolving the Gradle classpath needs an
// Android SDK and network access to Google's / Maven Central's repositories. Run
// `npm run licences:native -w packages/b-mobile` after changing native dependencies (a Capacitor or
// plugin bump, a new plugin) and commit native-licences.generated.json. scripts/native-licences.test.mjs
// checks the committed file's shape, not that it is current.
//
// The `nativeLicencesReport` task in android/app/build.gradle reads the licence each artifact's POM
// declares (inheriting from a parent POM if needed) for everything on releaseRuntimeClasspath.
// POMs carry a licence name and URL, not its text. The Apache-2.0 text, which covers nearly every
// artifact, is scripts/apache-2.0.txt (the canonical copy from apache.org); the other recognised
// licences' texts are in scripts/licence-texts/ (see TEXT_FILES). A licence not recognised here is
// shown as its name and the URL its POM gives, with no text bundled. A few POMs name their licence
// only 'License' (the Ionic libraries) or point at a README; those are matched by URL.
//
// The task also collects NOTICE files shipped inside the artifacts; they're carried onto the
// artifact as `notices: [{ path, text }]` and shown under it. As of 2026-10-08 no runtime artifact
// ships one (only Gradle/AGP build tooling does), so the committed file has none.
//
// Usage: node scripts/native-licences.mjs [path-to-native-licences.json]
//   With a path, skips Gradle and converts that report (the task's output).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANDROID_DIR = path.join(__dirname, '../android');
const REPORT_PATH = path.join(ANDROID_DIR, 'app/build/native-licences.json');
const PAGE_DIR = path.join(__dirname, '../src/screens/SCR-29-help-and-info');
export const OUT_PATH = path.join(PAGE_DIR, 'native-licences.generated.json');

const APACHE = {
  id: 'Apache-2.0',
  name: 'Apache License, Version 2.0',
  url: 'https://www.apache.org/licenses/LICENSE-2.0.txt',
};
const KNOWN = [
  [/apache/i, APACHE],
  [
    // Ionic's libraries: POM says just 'License'; the repo LICENSE at that URL is MIT.
    { url: /github\.com\/ionic-team\//i },
    { id: 'MIT', name: 'MIT License', url: 'https://opensource.org/licenses/MIT' },
  ],
  [
    // libyuv (inside androidx.camera:camera-core): POM links its README.chromium.
    { url: /libyuv/i },
    {
      id: 'BSD-3-Clause-libyuv',
      name: 'BSD 3-Clause License (libyuv)',
      url: 'https://chromium.googlesource.com/libyuv/libyuv/+/refs/heads/main/LICENSE',
    },
  ],
  [
    /android software development kit/i,
    {
      id: 'Android-SDK-License',
      name: 'Android Software Development Kit License',
      url: 'https://developer.android.com/studio/terms.html',
    },
  ],
  [
    /^(new bsd license|bsd-3-clause)$/i,
    {
      id: 'BSD-3-Clause',
      name: 'BSD 3-Clause License',
      url: 'https://opensource.org/licenses/BSD-3-Clause',
    },
  ],
  [
    /^eclipse public license 1\.0$/i,
    {
      id: 'EPL-1.0',
      name: 'Eclipse Public License 1.0',
      url: 'https://www.eclipse.org/legal/epl-v10.html',
    },
  ],
];

// Full texts, by licence id. Fetched from each project's own source (see the PR that added them):
// bsd-3-clause.txt holds both BSD-3 copyright variants in use (hamcrest, protobuf).
const TEXT_FILES = {
  'BSD-3-Clause': 'bsd-3-clause.txt',
  'BSD-3-Clause-libyuv': 'libyuv-bsd.txt',
  'EPL-1.0': 'epl-1.0.txt',
  'Android-SDK-License': 'android-sdk-license.txt',
  MIT: 'mit-ionic.txt',
};

/** The licence a POM-declared { name, url } belongs to. Anything not recognised keeps the name
 * and URL its POM gave, keyed by URL, so it stays a separate entry with a working link. */
function classify({ name, url }) {
  for (const [pattern, licence] of KNOWN) {
    const hit = pattern instanceof RegExp ? pattern.test(name) : pattern.url.test(url ?? '');
    if (hit) return licence;
  }
  return { id: url || name, name: name || 'Licence', url: url || null };
}

/** The JSON the licences page renders: { licences: [{ id, name, url, text }], artifacts: [{ name,
 * version, licences }] }, `licences` indexing the top-level `licences`. An artifact with no declared licence stops
 * the script, to be looked at by hand. */
export function buildNativeLicences(report, apache, texts = {}) {
  const licences = [];
  const index = new Map();
  const intern = (declared) => {
    const l = classify(declared);
    if (!index.has(l.id)) {
      index.set(l.id, licences.length);
      licences.push({
        id: l.id,
        name: l.name,
        url: l.url,
        text: l.id === APACHE.id ? apache : (texts[l.id] ?? null),
      });
    }
    return index.get(l.id);
  };
  const artifacts = report.map((a) => {
    if (a.licences.length === 0) {
      throw new Error(`${a.group}:${a.name}:${a.version} declares no licence in its POM`);
    }
    return {
      name: `${a.group}:${a.name}`,
      version: a.version,
      licences: [...new Set(a.licences.map(intern))],
      ...(a.notices?.length ? { notices: a.notices } : {}),
    };
  });
  artifacts.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return { licences, artifacts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let reportPath = process.argv[2];
  if (!reportPath) {
    // Not --offline: Gradle's offline mode can't use POMs it downloaded earlier unless they were
    // fetched through this exact query. On the egress-controlled VM the proxy settings in
    // ~/.gradle/gradle.properties apply, and ANDROID_HOME must point at the SDK.
    execFileSync('./gradlew', ['-q', ':app:nativeLicencesReport'], {
      cwd: ANDROID_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        ANDROID_HOME: process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Android/Sdk'),
      },
    });
    reportPath = REPORT_PATH;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const apache = fs.readFileSync(path.join(__dirname, 'apache-2.0.txt'), 'utf8').trim();
  const texts = Object.fromEntries(
    Object.entries(TEXT_FILES).map(([id, file]) => [
      id,
      fs.readFileSync(path.join(__dirname, 'licence-texts', file), 'utf8').trim(),
    ]),
  );
  const result = buildNativeLicences(report, apache, texts);
  const prettier = await import('prettier');
  const options = (await prettier.resolveConfig(OUT_PATH)) ?? {};
  fs.writeFileSync(
    OUT_PATH,
    await prettier.format(JSON.stringify(result), { ...options, parser: 'json' }),
  );
  console.log(
    `native licences: ${result.artifacts.length} artifacts, ${result.licences.length} licences`,
  );
}
