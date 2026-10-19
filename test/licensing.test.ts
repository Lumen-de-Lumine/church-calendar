/**
 * Pins the license split described in LICENSE: every source file carries the
 * SPDX identifier its path calls for, and the MIT files import only files that
 * can be used under MIT, so `roman-catholic-church-calendar/core` stays MIT.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MIT = 'MIT';
const LGPL = 'LGPL-3.0-or-later';
const MIT_OR_LGPL = 'MIT OR LGPL-3.0-or-later';

/** The calendarium-romanum data the core reads; everything else in src/data is LGPL. */
const MIT_DATA_FILES = new Set(['src/data/sanctorale-files.ts', 'src/data/locales.ts']);

/** Code Source & Summit wrote without deriving it from either Ruby project. */
const OWN_DIRS = ['src/http/adapters/', 'bin/', 'lambda/', 'scripts/'];
const OWN_FILES = new Set([
  'src/http/types.ts',
  'src/http/index.ts',
  'src/index.ts',
  'src/data/index.ts',
]);

function expectedLicense(path: string): string {
  if (path.startsWith('src/core/') || MIT_DATA_FILES.has(path)) return MIT;
  if (OWN_FILES.has(path) || OWN_DIRS.some((dir) => path.startsWith(dir))) return MIT_OR_LGPL;
  return LGPL;
}

function allowsMit(license: string): boolean {
  return license === MIT || license === MIT_OR_LGPL;
}

function listSources(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(ts|mjs)$/.test(name))
    .map((name) => join(dir, name).split('\\').join('/'))
    .sort();
}

function spdxOf(text: string): string | undefined {
  const lines = text.split('\n');
  const first = lines[0].startsWith('#!') ? lines[1] : lines[0];
  return /^\/\/ SPDX-License-Identifier: (.+)$/.exec(first ?? '')?.[1];
}

/** Repo-relative paths of the relative imports and re-exports in `path`. */
function relativeImports(path: string): string[] {
  const text = readFileSync(join(ROOT, path), 'utf8');
  const specifiers = [
    ...text.matchAll(/^\s*(?:import|export)\b[^'"]*?['"](\.[^'"]+)['"]/gm),
    ...text.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  return specifiers.map((s) =>
    relative(ROOT, resolve(ROOT, dirname(path), s.replace(/\.js$/, '.ts'))).split('\\').join('/'),
  );
}

const SOURCES = [
  ...listSources('src'),
  ...listSources('bin'),
  ...listSources('lambda'),
  ...listSources('scripts'),
];

describe('license headers', () => {
  it.each(SOURCES)('%s names the license its path calls for', (path) => {
    expect(spdxOf(readFileSync(join(ROOT, path), 'utf8'))).toBe(expectedLicense(path));
  });
});

describe('the MIT core', () => {
  const mitSources = SOURCES.filter((p) => expectedLicense(p) === MIT);

  it('covers src/core and the two calendarium-romanum data files', () => {
    expect(mitSources).toContain('src/core/index.ts');
    expect(mitSources).toEqual(expect.arrayContaining([...MIT_DATA_FILES]));
  });

  it.each(mitSources)('%s imports only files usable under MIT', (path) => {
    const lgplImports = relativeImports(path).filter((p) => !allowsMit(expectedLicense(p)));
    expect(lgplImports).toEqual([]);
  });
});
