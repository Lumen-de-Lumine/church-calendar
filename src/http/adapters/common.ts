// Shared request-shaping helpers for the adapters. No Node types here.

import type { HttpRequest, HttpResponse, QueryValue } from '../types.js';

type QueryHash = { [key: string]: QueryValue };

/**
 * Percent-decodes a path segment the way Rack/Mustermann does, tolerating junk.
 * An encoded slash stays `%2F`, so it cannot turn into a segment separator
 * (ruby: Mustermann matches `%2F` inside a capture).
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/%2F/gi, '%252F'));
  } catch {
    return segment;
  }
}

/** Decodes a raw request path segment by segment (see {@link decodeSegment}). */
export function decodePath(rawPath: string): string {
  return rawPath.split('/').map(decodeSegment).join('/') || '/';
}

/** Splits a raw request target into a decoded path and a parsed query. */
export function splitTarget(target: string): {
  path: string;
  query: Record<string, QueryValue>;
} {
  const hashIndex = target.indexOf('#');
  const withoutHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  const rawPath = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? '' : withoutHash.slice(queryIndex + 1);

  const path = decodePath(rawPath);

  return { path: path.startsWith('/') ? path : `/${path}`, query: parseQuery(rawQuery) };
}

/** Where Rack raises InvalidParameterError, ParameterTypeError or RangeError. */
class UnparseableQueryError extends Error {}

const unparseableQueries = new WeakSet<object>();

/**
 * True when Rack would have refused to parse the query {@link parseQuery} built:
 * a stray `%`, clashing parameter types (`q=a&q[]=b`) or nesting deeper than 100.
 * Grape then raises from every matched API route (a 502); the web UI never reads
 * the query.
 */
export function isUnparseableQuery(query: object): boolean {
  return unparseableQueries.has(query);
}

/** ruby: Rack 1.6.8 `Utils.param_depth_limit`. */
const PARAM_DEPTH_LIMIT = 100;

/**
 * ruby: Rack 1.6.8's `Utils.parse_nested_query(qs, '&;')`, which Grape builds
 * `params` from. Pairs are split on `&` or `;`, a repeated key keeps its LAST
 * value, a key without `=` is `null` (Ruby's nil), `name[]` builds an array and
 * `name[sub]` an object; the last two are what make `?q[]=x` a 502
 * (docs/QUIRKS.md Q23).
 */
export function parseQuery(raw: string): Record<string, QueryValue> {
  const params: QueryHash = Object.create(null);
  try {
    for (const pair of raw.split(/[&;] */)) {
      const eq = pair.indexOf('=');
      const name = unescapeComponent(eq === -1 ? pair : pair.slice(0, eq));
      const value = eq === -1 ? null : unescapeComponent(pair.slice(eq + 1));
      normalizeParams(params, name, value, PARAM_DEPTH_LIMIT);
    }
  } catch (error) {
    if (!(error instanceof UnparseableQueryError)) throw error;
    unparseableQueries.add(params);
  }
  return params;
}

/** ruby: `URI.decode_www_form_component` — `+` is a space, a stray `%` raises. */
function unescapeComponent(value: string): string {
  if (/%(?![0-9a-fA-F]{2})/.test(value)) throw new UnparseableQueryError();
  const spaced = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced; // invalid UTF-8: Rack keeps the bytes, this keeps the text
  }
}

function isHash(value: QueryValue | undefined): value is QueryHash {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ruby: Rack 1.6.8 `Utils.normalize_params`, statement for statement. Every
 * object is prototype-less, so `__proto__[x]=1` is just another key.
 */
function normalizeParams(
  params: QueryHash,
  name: string,
  v: string | null,
  depth: number,
): QueryHash | null {
  if (depth <= 0) throw new UnparseableQueryError();

  const m = /^[[\]]*([^[\]]+)\]*/.exec(name);
  const k = m === null ? '' : m[1];
  const after = m === null ? '' : name.slice(m[0].length);
  if (k === '') return null;

  if (after === '') {
    params[k] = v;
  } else if (after === '[') {
    params[name] = v;
  } else if (after === '[]') {
    const list = (params[k] ??= []);
    if (!Array.isArray(list)) throw new UnparseableQueryError();
    list.push(v);
  } else {
    const child = /^\[\]\[([^[\]]+)\]$/.exec(after) ?? /^\[\](.+)$/.exec(after);
    if (child !== null) {
      const list = (params[k] ??= []);
      if (!Array.isArray(list)) throw new UnparseableQueryError();
      const last = list[list.length - 1];
      if (isHash(last) && !Object.prototype.hasOwnProperty.call(last, child[1])) {
        normalizeParams(last, child[1], v, depth - 1);
      } else {
        list.push(normalizeParams(Object.create(null), child[1], v, depth - 1));
      }
    } else {
      const hash = (params[k] ??= Object.create(null) as QueryHash);
      if (!isHash(hash)) throw new UnparseableQueryError();
      params[k] = normalizeParams(hash, after, v, depth - 1);
    }
  }
  return params;
}

/** Lower-cases header names and joins repeated values the way Rack does. */
export function normalizeHeaders(
  input: Iterable<[string, string | string[] | undefined]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of input) {
    if (value === undefined) continue;
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/** Byte length of a response body, for `content-length`. */
export function byteLength(body: string): number {
  // eslint-disable-next-line no-undef
  return typeof TextEncoder === 'undefined'
    ? Buffer.byteLength(body, 'utf8')
    : new TextEncoder().encode(body).length;
}

/** Adds `content-length` unless the response already carries one, or is a 204. */
export function withContentLength(response: HttpResponse, body: string): HttpResponse {
  if (response.status === 204 || response.headers['content-length'] !== undefined) return response;
  return {
    ...response,
    headers: { ...response.headers, 'content-length': String(byteLength(body)) },
  };
}

export type { HttpRequest, HttpResponse };
