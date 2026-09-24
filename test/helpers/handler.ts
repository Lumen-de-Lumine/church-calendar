/**
 * Test-side harness around `createHandler()`: a `get(url)` that takes the same
 * URLs the baseline capture used, plus the per-date diff printer the conformance
 * suite reports mismatches with.
 */

import { createHandler } from '../../src/http/router.js';
import type { CreateHandlerOptions } from '../../src/http/router.js';
import { parseQuery, splitTarget } from '../../src/http/adapters/common.js';
import type { HttpResponse } from '../../src/http/types.js';
import type { BaselineDay } from './fixtures.js';

export { parseQuery, splitTarget };

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
}

const defaultHandler = createHandler();

/** Issues a request against a handler, given a URL as written in the fixtures. */
export function request(
  url: string,
  options: RequestOptions = {},
  handler = defaultHandler,
): HttpResponse {
  const { path, query } = splitTarget(url);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers[name.toLowerCase()] = value;
  }
  return handler({ method: options.method ?? 'GET', path, query, headers });
}

/** `request()` plus a JSON parse of the body. */
export function getJson<T = unknown>(
  url: string,
  options: RequestOptions = {},
  handler = defaultHandler,
): { response: HttpResponse; body: T } {
  const response = request(url, options, handler);
  return { response, body: JSON.parse(response.body) as T };
}

export function makeHandler(options: CreateHandlerOptions = {}) {
  return createHandler(options);
}

// ---------------------------------------------------------------------------
// diffing
// ---------------------------------------------------------------------------

export interface DayDiff {
  date: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

function celebrationDiffs(
  date: string,
  prefix: string,
  expected: unknown,
  actual: unknown,
  out: DayDiff[],
): void {
  const exp = (expected ?? null) as Record<string, unknown> | null;
  const act = (actual ?? null) as Record<string, unknown> | null;
  if (exp === null || act === null) {
    if (JSON.stringify(exp) !== JSON.stringify(act)) {
      out.push({ date, field: prefix, expected: exp, actual: act });
    }
    return;
  }
  for (const key of ['title', 'colour', 'rank', 'rank_num', 'id']) {
    if (JSON.stringify(exp[key]) !== JSON.stringify(act[key])) {
      out.push({ date, field: `${prefix}.${key}`, expected: exp[key], actual: act[key] });
    }
  }
}

/** Field-level diff of two serialized days. Empty array means they are equal. */
export function diffDay(expected: BaselineDay, actual: BaselineDay | undefined): DayDiff[] {
  const out: DayDiff[] = [];
  const date = expected.date;
  if (actual === undefined) {
    out.push({ date, field: '<day>', expected: 'present', actual: 'missing' });
    return out;
  }

  for (const key of ['date', 'season', 'season_week', 'cycle', 'cycle_sunday', 'cycle_ferial', 'weekday'] as const) {
    if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
      out.push({ date, field: key, expected: expected[key], actual: actual[key] });
    }
  }

  const expCels = expected.celebrations ?? [];
  const actCels = actual.celebrations ?? [];
  if (expCels.length !== actCels.length) {
    out.push({
      date,
      field: 'celebrations.length',
      expected: expCels.map((c) => c.id ?? c.title),
      actual: actCels.map((c) => c.id ?? c.title),
    });
  }
  const count = Math.max(expCels.length, actCels.length);
  for (let i = 0; i < count; i += 1) {
    celebrationDiffs(date, `celebrations[${i}]`, expCels[i], actCels[i], out);
  }
  celebrationDiffs(date, 'vespers', expected.vespers, actual.vespers, out);

  const expKeys = Object.keys(expected).join(',');
  const actKeys = Object.keys(actual).join(',');
  if (expKeys !== actKeys) {
    out.push({ date, field: '<key order>', expected: expKeys, actual: actKeys });
  }
  return out;
}

/** Diff of two day arrays, matched positionally then by date. */
export function diffDays(
  expected: readonly BaselineDay[],
  actual: readonly BaselineDay[],
): DayDiff[] {
  const out: DayDiff[] = [];
  if (expected.length !== actual.length) {
    out.push({
      date: '<array>',
      field: 'length',
      expected: expected.length,
      actual: actual.length,
    });
  }
  const byDate = new Map(actual.map((d) => [d.date, d]));
  for (const day of expected) {
    out.push(...diffDay(day, byDate.get(day.date)));
    if (out.length > 200) break;
  }
  for (const day of actual) {
    if (!expected.some((e) => e.date === day.date)) {
      out.push({ date: day.date, field: '<day>', expected: 'absent', actual: 'present' });
    }
  }
  return out;
}

/** Renders diffs as `date | field | expected | actual` rows for the failure message. */
export function formatDiffs(label: string, diffs: readonly DayDiff[]): string {
  const rows = diffs
    .slice(0, 40)
    .map(
      (d) =>
        `  ${d.date.padEnd(12)} ${d.field.padEnd(24)} ` +
        `expected=${JSON.stringify(d.expected)} actual=${JSON.stringify(d.actual)}`,
    );
  const more = diffs.length > 40 ? `\n  ... and ${diffs.length - 40} more` : '';
  return `${label}: ${diffs.length} mismatch(es)\n  ${'date'.padEnd(12)} ${'field'.padEnd(24)} expected / actual\n${rows.join('\n')}${more}`;
}
