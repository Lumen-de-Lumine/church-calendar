// ruby: apps/api/v0/controllers/api_v0.rb — `parse_date(headers['Date'])` and the
//       three `Date.parse` calls in the `search` endpoint.
//
// Ruby's `Date.parse` is extremely lenient. The full grammar of `Date._parse`
// (ISO 8601 ordinal/week dates, `vms`, `sla`, `dot`, `iso2`, `jis`, `bc` eras,
// day-of-year, `--mm-dd`, era names, ...) is far more than the API surface needs,
// so this port implements the subset that is (a) exercised by the conformance
// fixtures and (b) reachable from the two consumers. Everything it does NOT
// implement is listed in docs/QUIRKS.md (Q21).
//
// Verified against `sourceandsummit/church-calendar-api:2.7.0` on 2026-09-18 —
// each accepted/rejected example below was run through the image's own Ruby.

import { CalDate } from '../core/cal-date.js';
import { DateParseError } from './errors.js';

/**
 * Month names as `Date._parse` matches them: case-insensitive, and any prefix of
 * at least three letters (`sep`, `sept`, `september` all work).
 */
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

function monthFromName(name: string): number | null {
  const needle = name.toLowerCase().replace(/\.$/, '');
  if (needle.length < 3) return null;
  for (let i = 0; i < MONTH_NAMES.length; i += 1) {
    if (MONTH_NAMES[i].startsWith(needle)) return i + 1;
  }
  return null;
}

/**
 * ruby: `Date._parse`'s two-digit-year rule — a year written with at most two
 * digits is completed to 20xx below 69 and 19xx from 69 up.
 * (`Date.parse('1-1-1')` is 2001-01-01; RFC 850's `01-Jan-00` is 2000-01-01.)
 */
function completeYear(digits: string): number {
  const n = Number(digits);
  if (digits.length > 2) return n;
  return n < 69 ? n + 2000 : n + 1900;
}

function build(year: number, month: number, day: number, raw: string): CalDate {
  try {
    return new CalDate(year, month, day);
  } catch {
    // ruby: `Date.parse('2026-13-01')` raises ArgumentError('invalid date') —
    // the *grammar* matched, the resulting date did not exist.
    throw new DateParseError(raw);
  }
}

interface Rule {
  re: RegExp;
  /** Returns `[year, month, day]` or `null` when the match is not usable. */
  pick(m: RegExpMatchArray): [number, number, number] | null;
}

const TIME = String.raw`(?:[T\s]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?)?`;

const RULES: readonly Rule[] = [
  // `2026-09-18`, `2026-9-8`, `2026-09-18T14:00:00.000Z` (the time is discarded).
  {
    re: new RegExp(String.raw`^(\d{4,})-(\d{1,2})-(\d{1,2})${TIME}$`, 'i'),
    pick: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // `2026/9/18`, `2026.9.18`
  {
    re: new RegExp(String.raw`^(\d{4,})[/.](\d{1,2})[/.](\d{1,2})${TIME}$`, 'i'),
    pick: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // `20260918` — exactly eight digits, YYYYMMDD — and ISO basic `20260918T140000Z`.
  {
    re: /^(\d{4})(\d{2})(\d{2})(?:T\d{2}(?:\d{2}(?:\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/i,
    pick: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // RFC 1123 / RFC 822: `Sat, 01 Jan 2000 01:00:00 GMT`
  // and the bare `18 Sep 2026` / `18-Sep-2026` / `01-Jan-00` (RFC 850) forms.
  {
    re: /^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{1,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[A-Za-z]{1,5}|\s*[+-]\d{4})?)?\s*$/,
    pick: (m) => {
      const month = monthFromName(m[2]);
      return month === null ? null : [completeYear(m[3]), month, Number(m[1])];
    },
  },
  // `18th Sep 2026` — spaces only: Ruby reads `2nd-Feb-2026` as February 1st.
  {
    re: /^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3,9})\.?\s+(\d{1,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[A-Za-z]{1,5}|\s*[+-]\d{4})?)?\s*$/,
    pick: (m) => {
      const month = monthFromName(m[2]);
      return month === null ? null : [completeYear(m[3]), month, Number(m[1])];
    },
  },
  // asctime: `Sat Jan  1 01:00:00 2000`
  {
    re: /^[A-Za-z]{3,9}\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})\s+\d{1,2}:\d{2}(?::\d{2})?\s+(\d{1,4})\s*$/,
    pick: (m) => {
      const month = monthFromName(m[1]);
      return month === null ? null : [completeYear(m[3]), month, Number(m[2])];
    },
  },
  // `Sep 18 2026`, `Sep 18, 2026`, `Friday, September 18, 2026`, and JavaScript's
  // `Date#toString()`: `Fri Sep 18 2026 10:00:00 GMT+0000 (Coordinated Universal Time)`.
  {
    re: /^(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{1,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:[A-Za-z]{1,5})?[+-]\d{2}:?\d{2}|\s*[A-Za-z]{1,5})?)?(?:\s*\([^)]*\))?\s*$/,
    pick: (m) => {
      const month = monthFromName(m[1]);
      return month === null ? null : [completeYear(m[3]), month, Number(m[2])];
    },
  },
  // `Sep 2026` -> the first of the month (ruby: the day defaults to 1).
  {
    re: /^([A-Za-z]{3,9})\.?,?\s+(\d{4})\s*$/,
    pick: (m) => {
      const month = monthFromName(m[1]);
      return month === null ? null : [Number(m[2]), month, 1];
    },
  },
  // `18/09/2026`, `18-09-2026`, `1-1-1` — DAY first, then month, then year.
  // This is why `12/25/2025` and `09/18/2026` are rejected: month 25 / month 18.
  {
    re: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{1,4})$/,
    pick: (m) => [completeYear(m[3]), Number(m[2]), Number(m[1])],
  },
];

/**
 * ruby: `Date.parse(value)` — the subset described above.
 *
 * Accepts (verified against 2.7.0): `2026-09-18`, `2026-09-18T14:00:00.000Z`,
 * `2026/9/18`, `20260918`, `20260918T140000Z`, `18 Sep 2026`, `18th Sep 2026`,
 * `Sep 18 2026`, `Friday, September 18, 2026`, `2026-9-8`, `25 Dec 2025`,
 * `2026.9.18`, `Sept 18 2026`, `18/09/2026`, `18-09-2026`, `1-1-1`, `Sep 2026`,
 * the three HTTP date formats and JavaScript's `Date#toString()` output.
 *
 * Rejects (verified): `garbage`, `2026-13-01`, `2026`, `12/25/2025`, `0`,
 * `2026-09`, `09/18/2026`, `20260931`, `2026-02-30`, `not-a-date`, `` and `   `.
 *
 * @throws {DateParseError} for anything it cannot parse (ruby: `ArgumentError`)
 */
export function parseDateParam(value: string): CalDate {
  const trimmed = value.trim();
  if (trimmed === '') throw new DateParseError(value);

  for (const rule of RULES) {
    const m = rule.re.exec(trimmed);
    if (!m) continue;
    const picked = rule.pick(m);
    if (picked === null) continue;
    return build(picked[0], picked[1], picked[2], value);
  }

  throw new DateParseError(value);
}

/**
 * ruby: `parse_date(headers['Date'])`.
 *
 * The Ruby helper calls the very same `Date.parse`, so the HTTP `Date` header
 * accepts every format {@link parseDateParam} does — including `2026-09-18`,
 * which is not a valid HTTP-date. The three canonical HTTP formats (RFC 1123,
 * RFC 850 and asctime) are all covered by the rules above; this function exists
 * so the caller can attach the header-specific error message.
 *
 * @throws {DateParseError} (ruby: `ArgumentError`, turned into
 *   `400 {"error":"invalid content of HTTP header Date"}`)
 */
export function parseDateHeader(value: string): CalDate {
  return parseDateParam(value);
}

/** ruby: `Date.today` — the Ruby service runs with `TZ` unset, i.e. UTC. */
export function today(): CalDate {
  return CalDate.today();
}
