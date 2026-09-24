// ruby: apps/api/v0/controllers/api_v0.rb
//
//     formatter :json, -> (obj, env) { MultiJson.dump(obj, pretty: true) }
//
// MultiJson picks Oj (it is in the Gemfile), and `Oj.dump(obj, indent: 2)`
// indents only objects Oj knows how to walk: a real `Hash`, `Array`, `String`,
// number, `nil`. A `Grape::Entity` is none of those, so Oj falls back to the
// object's `#to_json`, which ignores the indent entirely. THREE distinct shapes
// come out of the same formatter:
//
//   1. plain Hash / Array of Strings  -> PRETTY: 2-space indent and NO space
//      after `:` (this is Oj's pretty form, not `JSON.pretty_generate`'s),
//      terminated by a newline.            `/calendars`, `/calendars/:cal`, `/:year`
//   2. a single Grape::Entity         -> fully COMPACT, terminated by a newline.
//                                          `/:y/:m/:d`, `today`, `yesterday`, `tomorrow`
//   3. an Array of Grape::Entity      -> the ARRAY is pretty (one item per line,
//      indented two spaces) and each ITEM is compact.  `/:y/:m`, `search`
//
// And a fourth, which is NOT this formatter at all: Grape's default *error*
// formatter (`Grape::ErrorFormatter::Json`) dumps `{"error": ...}` compactly and
// WITHOUT a trailing newline, because `formatter :json` only replaces the
// success formatter. Every byte below was checked against
// sourceandsummit/church-calendar-api:2.7.0 and over HTTP.

/** Anything `JSON.stringify` accepts. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Object keys whose value is a Ruby `Float`, not an `Integer`.
 *
 * `Rank#priority` is a Float, and `Float#to_json` ALWAYS prints a decimal point:
 * `Ranks::COMMEMORATION` (4.0) goes on the wire as `"rank_num":4.0`, not `4`.
 * Verified inside sourceandsummit/church-calendar-api:2.7.0 —
 * `GET /api/v0/en/calendars/us/1999/12/31` is 539 bytes, which only works with
 * `4.0`; with `4` it is 537. (docs/BASELINE.md and the fixture README say the
 * opposite; they were reading `JSON.parse`d fixtures, where `4.0` is already
 * normalized to `4`. See docs/QUIRKS.md Q18.)
 *
 * `3.10` is NOT affected: the Ruby literal `3.10` IS the number 3.1, and
 * `3.1.to_json` is `"3.1"`.
 */
const RUBY_FLOAT_KEYS: ReadonlySet<string> = new Set(['rank_num']);

/** ruby: `Float#to_s` — an integral Float still prints its `.0`. */
function rubyFloat(n: number): string {
  if (!Number.isFinite(n)) return JSON.stringify(n) as string;
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

function scalar(value: unknown, isFloat: boolean): string {
  if (isFloat && typeof value === 'number') return rubyFloat(value);
  return JSON.stringify(value) as string;
}

function compact(value: unknown, isFloat = false): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => compact(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const items = Object.entries(value as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .map(([key, val]) => `${JSON.stringify(key)}:${compact(val, RUBY_FLOAT_KEYS.has(key))}`);
    return `{${items.join(',')}}`;
  }
  return scalar(value, isFloat);
}

/** ruby: `#to_json` — compact, key order as inserted, Ruby Float formatting. */
export function formatCompact(value: unknown): string {
  return compact(value);
}

function pretty(value: unknown, indent: string, isFloat = false): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = indent + '  ';
    const items = value.map((item) => inner + pretty(item, inner));
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, val]) => val !== undefined,
    );
    if (entries.length === 0) return '{}';
    const inner = indent + '  ';
    const items = entries.map(
      ([key, val]) =>
        `${inner}${JSON.stringify(key)}:${pretty(val, inner, RUBY_FLOAT_KEYS.has(key))}`,
    );
    return `{\n${items.join(',\n')}\n${indent}}`;
  }
  return scalar(value, isFloat);
}

/**
 * Shape 1 — `MultiJson.dump(<Hash|Array>, pretty: true)` through Oj.
 *
 * Two-space indent, **no space after the colon**, nested containers opening on
 * the key's own line, and a trailing newline.
 */
export function formatPlain(value: unknown): string {
  return `${pretty(value, '')}\n`;
}

/** Shape 2 — a single serialized day: compact, with a trailing newline. */
export function formatEntity(value: unknown): string {
  return `${formatCompact(value)}\n`;
}

/**
 * Shape 3 — an array of serialized days: pretty array, compact items, trailing
 * newline. An empty result is `"[]\n"`.
 */
export function formatEntityArray(values: readonly unknown[]): string {
  if (values.length === 0) return '[]\n';
  const items = values.map((value) => `  ${formatCompact(value)}`);
  return `[\n${items.join(',\n')}\n]\n`;
}

/**
 * Shape 4 — Grape's default JSON *error* formatter: compact, **no** trailing
 * newline. (`{"error":"day does not have a valid value"}` is 43 bytes on the
 * wire, which only works without the newline.)
 */
export function formatError(message: string): string {
  return formatCompact({ error: message });
}

/**
 * The 301 bodies: Grape sets `body "This resource has been moved permanently to
 * <path>."` and the JSON formatter dumps that String. Oj's pretty mode leaves a
 * scalar alone and adds no newline, so the body is exactly the quoted string.
 */
export function formatString(value: string): string {
  return formatCompact(value);
}
