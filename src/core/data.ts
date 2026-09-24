// ruby: lib/calendarium-romanum/data.rb
//
// The Ruby `Data::SanctoraleFile` holds a filesystem path; here it holds the
// embedded file text generated into src/data/sanctorale-files.ts.

import { SANCTORALE_FILES, SANCTORALE_SIGLA } from '../data/sanctorale-files.js';
import type { Sanctorale } from './sanctorale.js';
import { SanctoraleFactory } from './sanctorale-factory.js';
import { SanctoraleLoader } from './sanctorale-loader.js';

/** Resolves a data-file name as written in a file's `extends:` front matter. */
function resolveDataFile(name: string): string {
  const siglum = name.replace(/^.*\//, '').replace(/\.txt$/, '');
  const text = SANCTORALE_FILES[siglum];
  if (text === undefined) {
    throw new Error(`Unknown packaged sanctorale data file ${JSON.stringify(name)}`);
  }
  return text;
}

/** One packaged sanctorale data file. */
export class SanctoraleFile {
  readonly siglum: string;

  constructor(siglum: string) {
    this.siglum = siglum;
  }

  /** Verbatim contents of the data file. */
  get text(): string {
    return resolveDataFile(this.siglum);
  }

  /**
   * Load the data file.
   *
   * Note `universal-fr` and `universal-es` contain a duplicated
   * `faustina_kowalska` record and therefore **always** throw
   * {@link ArgumentError} (see docs/QUIRKS.md, Q10). The data is deliberately
   * not fixed here.
   */
  load(): Sanctorale {
    return new SanctoraleLoader().load(this.text);
  }

  /** Load the data file and all its parents (via the `extends` front-matter key). */
  loadWithParents(): Sanctorale {
    return SanctoraleFactory.loadWithParents(this.text, resolveDataFile);
  }
}

const GENERAL_ROMAN_LATIN = new SanctoraleFile('universal-la');
const GENERAL_ROMAN_ENGLISH = new SanctoraleFile('universal-en');
const GENERAL_ROMAN_FRENCH = new SanctoraleFile('universal-fr');
const GENERAL_ROMAN_ITALIAN = new SanctoraleFile('universal-it');
const GENERAL_ROMAN_SPANISH = new SanctoraleFile('universal-es');
const US_ENGLISH = new SanctoraleFile('us-en');
const CZECH = new SanctoraleFile('czech-cs');

/** ruby: the `Data.values` list — named constants first, then the remaining Czech files. */
const NAMED: readonly SanctoraleFile[] = [
  GENERAL_ROMAN_LATIN,
  GENERAL_ROMAN_ENGLISH,
  GENERAL_ROMAN_FRENCH,
  GENERAL_ROMAN_ITALIAN,
  GENERAL_ROMAN_SPANISH,
  US_ENGLISH,
  CZECH,
];

const REST: readonly SanctoraleFile[] = [
  'czech-brno-cs',
  'czech-budejovice-cs',
  'czech-cechy-cs',
  'czech-hradec-cs',
  'czech-litomerice-cs',
  'czech-morava-cs',
  'czech-olomouc-cs',
  'czech-ostrava-cs',
  'czech-plzen-cs',
  'czech-praha-cs',
].map((siglum) => new SanctoraleFile(siglum));

/** ruby: `Data.all` */
export const DataAll: readonly SanctoraleFile[] = [...NAMED, ...REST];

/** Sigla of every packaged data file, in `Data.all` order. */
export const DataSigla: readonly string[] = DataAll.map((f) => f.siglum);

/**
 * Allows easy access to the bundled data files.
 *
 * Indexable by siglum (`Data['universal-en']`, ruby: `Data[...]`) and by the
 * gem's constant names (`Data.GENERAL_ROMAN_ENGLISH`).
 */
export const Data: Record<string, SanctoraleFile> = {
  ...Object.fromEntries(DataAll.map((file) => [file.siglum, file])),
  GENERAL_ROMAN_LATIN,
  GENERAL_ROMAN_ENGLISH,
  GENERAL_ROMAN_FRENCH,
  GENERAL_ROMAN_ITALIAN,
  GENERAL_ROMAN_SPANISH,
  US_ENGLISH,
  CZECH,
};

export { SANCTORALE_FILES, SANCTORALE_SIGLA };
