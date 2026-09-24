// The framework-agnostic request/response pair every adapter converts to and
// from. Deliberately plain data: no streams, no Node types, no `Request`.

/**
 * One query parameter as Rack 1.6's `parse_nested_query` builds it: a string,
 * `null` for a key without `=`, an array for `key[]`, an object for `key[sub]`.
 */
export type QueryValue = string | null | QueryValue[] | { [key: string]: QueryValue };

/** A parsed, framework-independent HTTP request. */
export interface HttpRequest {
  /** Upper- or lower-case; the router normalizes it. */
  method: string;
  /**
   * Path only, percent-decoded per segment (an encoded slash stays `%2F`),
   * always starting with `/`.
   */
  path: string;
  /**
   * Query parameters, as Rack parses them: a repeated key (`?q=a&q=b`) keeps its
   * last value, and a bracketed one (`q[]=a`, `q[x]=a`) arrives as an array or
   * an object — which the Ruby app cannot handle and neither can this port; see
   * docs/QUIRKS.md Q23.
   */
  query: Record<string, QueryValue>;
  /** Header names LOWER-CASED. */
  headers: Record<string, string>;
}

/** A complete response: the router never streams. */
export interface HttpResponse {
  status: number;
  /** Header names lower-cased, exactly as the Ruby stack emits them. */
  headers: Record<string, string>;
  /** Always a string; `''` for the bodyless 404/400/302 web responses. */
  body: string;
}

/** `createHandler()` returns one of these. */
export type Handler = (request: HttpRequest) => HttpResponse;

export interface HandlerOptions {
  /**
   * Emit an ABSOLUTE `Location` on the 301 redirects, built from the request's
   * `x-forwarded-proto`/`x-forwarded-host`/`host` headers.
   *
   * Default `false`, which is what the Ruby service does: verified over HTTP
   * against a 2.7.0 deployment on 2026-09-18, whose `GET /api/v0/en/today`
   * answers `location: /api/v0/en/calendars/default/today`.
   * (docs/BASELINE.md says "absolute"; the wire says relative, and
   * `test/fixtures/baseline/misc/redirects.json` records the relative form.)
   */
  absoluteRedirects?: boolean;
  /** Override the scheme used for `swagger.yml`'s `docs_url` and absolute redirects. */
  defaultScheme?: string;
  /** Override the host used when the request carries no `host` header. */
  defaultHost?: string;
}
