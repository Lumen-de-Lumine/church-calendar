// ruby: lib/calendarium-romanum/sanctorale_loader.rb

import { AbstractDate } from './abstract-date.js';
import { Celebration } from './day.js';
import type { Colour } from './enums.js';
import { Colours, Ranks } from './enums.js';
import { InvalidDataError } from './errors.js';
import type { Rank } from './rank.js';
import { Sanctorale } from './sanctorale.js';
import type { SanctoraleMetadata } from './sanctorale.js';

/** ruby: `SanctoraleLoader::RANK_CODES` (the `nil` key is the default). */
const RANK_CODES: Record<string, Rank> = {
  m: Ranks.MEMORIAL_GENERAL,
  f: Ranks.FEAST_GENERAL,
  s: Ranks.SOLEMNITY_GENERAL,
};
const DEFAULT_RANK = Ranks.MEMORIAL_OPTIONAL;

/** ruby: `SanctoraleLoader::COLOUR_CODES` (the `nil` key is the default). */
const COLOUR_CODES: Record<string, Colour> = {
  w: Colours.WHITE,
  v: Colours.VIOLET,
  g: Colours.GREEN,
  r: Colours.RED,
};
const DEFAULT_COLOUR = Colours.WHITE;

// ruby: SanctoraleLoader#line_regexp, with `rank_letters` = "mfs" and
// `colour_letters` = "wvgr" (the order the Ruby Hashes list them in).
const LINE_REGEXP =
  /^((?<month>\d+)\/)?(?<day>\d+)(?<move_if_sunday>\+1sunday)?(\s+(?<rank_char>[mfs])?(?<rank_num>\d\.\d{1,2})?)?(\s+(?<colour>[wvgr]))?(\s+(?<symbol>[\w]{2,}))?(\s+(?<has_vigil>vigil))?\s*:(?<title>.*)$/i;

const MONTH_SECTION_REGEXP = /^=\s*(\d+)\s*$/;

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** Strips a YAML end-of-line comment (` #...`), which must be preceded by whitespace. */
function stripComment(value: string): string {
  const m = /(^|\s)#/.exec(value);
  if (!m) return value;
  return value.slice(0, m.index).trimEnd();
}

/**
 * Minimal YAML front-matter parser covering exactly the forms the packaged data
 * files use: `key: value` scalars, `key:` followed by an indented `- item` list,
 * blank lines and whole-line `# comments`.
 *
 * ruby: `YAML.load(front_matter)` — a full YAML 1.1 parser; this port carries no
 * runtime dependencies, so only the forms actually present are supported.
 */
export function parseFrontMatter(text: string): SanctoraleMetadata {
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  let currentListKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '' || line.trim() === '---') {
      continue;
    }
    if (/^\s*#/.test(line)) {
      continue;
    }

    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && currentListKey !== null) {
      (result[currentListKey] as unknown[]).push(stripQuotes(stripComment(listItem[1]).trim()));
      continue;
    }

    const pair = /^([^:\s][^:]*):(.*)$/.exec(line);
    if (pair) {
      const key = pair[1].trim();
      const value = stripComment(pair[2]).trim();
      if (value === '') {
        currentListKey = key;
        result[key] = [];
      } else {
        currentListKey = null;
        result[key] = stripQuotes(value);
      }
      continue;
    }

    currentListKey = null;
  }

  return result;
}

/**
 * Understands the custom plaintext calendar format and knows how to transform it
 * into {@link Celebration}s filled into a {@link Sanctorale}.
 */
export class SanctoraleLoader {
  /**
   * @param src the data file's contents
   * @param dest instance to populate; a new one is created when omitted
   * @throws {InvalidDataError} on a syntactically or semantically invalid line
   */
  load(src: string, dest?: Sanctorale | null): Sanctorale {
    const target = dest ?? new Sanctorale();

    let inFrontMatter = false;
    let frontMatter = '';
    let monthSection: number | null = null;

    // ruby: `src.each_line.with_index(1)`
    const lines = src === '' ? [] : src.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const lineNum = i + 1;
      let l = lines[i];

      // skip YAML front matter
      if (lineNum === 1 && l.startsWith('---')) {
        inFrontMatter = true;
        frontMatter += `${l}\n`;
        continue;
      } else if (inFrontMatter) {
        if (l.startsWith('---')) {
          inFrontMatter = false;
          target.metadata = parseFrontMatter(frontMatter);
        }
        frontMatter += `${l}\n`;
        continue;
      }

      // strip whitespace and comments
      l = l.replace(/#.*/, '').trim();
      if (l === '') continue;

      // month section heading
      const n = MONTH_SECTION_REGEXP.exec(l);
      if (n !== null) {
        monthSection = Number(n[1]);
        if (!(monthSection >= 1 && monthSection <= 12)) {
          throw SanctoraleLoader.error(`Invalid month ${monthSection}`, lineNum);
        }
        continue;
      }

      let celebration: Celebration;
      try {
        // ruby: `rescue RangeError, RuntimeError => err` — both are plain Errors here
        celebration = this.loadLine(l, monthSection);
      } catch (err) {
        if (err instanceof Error) {
          throw SanctoraleLoader.error(err.message, lineNum);
        }
        throw err;
      }

      // ruby: `celebration.date&.month` — #load_line always sets a date
      const date = celebration.date as AbstractDate;
      target.add(date.month, date.day, celebration);
    }

    return target;
  }

  /** ruby: `SanctoraleLoader#load_from_string` is an alias of `#load`. */
  loadFromString(src: string, dest?: Sanctorale | null): Sanctorale {
    return this.load(src, dest);
  }

  /**
   * ruby: the private `SanctoraleLoader#load_line`.
   *
   * @throws {RangeError} for an invalid month/day
   * @throws {Error} for a syntax error or an invalid rank
   */
  loadLine(line: string, monthSection: number | null = null): Celebration {
    const m = LINE_REGEXP.exec(line);
    if (m === null) {
      throw new Error(`Syntax error, line skipped '${line}'`);
    }

    const groups = m.groups as Record<string, string | undefined>;

    // ruby: `(m[:month] || month_section).to_i` — `nil.to_i` is 0, which makes
    // AbstractDate raise "Invalid month 0."
    const monthStr = groups.month ?? (monthSection === null ? null : String(monthSection));
    const month = monthStr === null ? 0 : Number.parseInt(monthStr, 10);
    const day = Number.parseInt(groups.day as string, 10);
    const moveIfSunday = groups.move_if_sunday === '+1sunday';
    const rankChar = groups.rank_char;
    const rankNumStr = groups.rank_num;
    const colour = groups.colour;
    const symbolStr = groups.symbol;
    const title = groups.title ?? '';
    const hasVigil = groups.has_vigil === 'vigil';

    let rank: Rank = rankChar === undefined ? DEFAULT_RANK : RANK_CODES[rankChar.toLowerCase()];

    if (rankNumStr !== undefined) {
      const rankNum = Number.parseFloat(rankNumStr);
      const rankByNum = Ranks.byPriority(rankNum);

      if (rankByNum === undefined) {
        throw new Error(`Invalid celebration rank code ${rankNum}`);
      } else if (
        rankChar !== undefined &&
        Math.trunc(rank.priority) !== Math.trunc(rankByNum.priority)
      ) {
        throw new Error(
          `Invalid combination of rank letter ${JSON.stringify(rankChar)} and number ${rankNum}.`,
        );
      }

      rank = rankByNum;
    }

    const symbol = symbolStr === undefined ? null : symbolStr;

    return new Celebration({
      title: title.trim(),
      rank,
      colour: colour === undefined ? DEFAULT_COLOUR : COLOUR_CODES[colour.toLowerCase()],
      symbol,
      date: new AbstractDate(month, day),
      cycle: 'sanctorale',
      hasVigil,
      hasEvening: false,
      moveIfSunday,
    });
  }

  private static error(message: string, lineNumber: number): InvalidDataError {
    return new InvalidDataError(`L${lineNumber}: ${message}`);
  }
}
