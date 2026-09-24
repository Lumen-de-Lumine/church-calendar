// WHATWG fetch adapter: `Request -> Response`. Works in Cloudflare Workers,
// Deno, Bun, a Node 18+ `fetch` server and a Service Worker.

import { createHandler } from '../router.js';
import type { CreateHandlerOptions } from '../router.js';
import type { Handler } from '../types.js';
import { decodePath, parseQuery } from './common.js';

/**
 * Builds a `(request: Request) => Response` function.
 *
 * ```ts
 * export default { fetch: createFetchHandler() };
 * ```
 */
export function createFetchHandler(
  options: CreateHandlerOptions = {},
): (request: Request) => Response {
  return createFetchHandlerFrom(createHandler(options), options);
}

/** Same, around a handler you already built. */
export function createFetchHandlerFrom(
  handler: Handler,
  _options: CreateHandlerOptions = {},
): (request: Request) => Response {
  return function fetchHandler(request: Request): Response {
    const url = new URL(request.url);

    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    // A `Request` often carries no `host` header (fetch sets it at the socket),
    // but `/swagger.yml` needs an absolute `docs_url`, so take it from the URL.
    if (headers.host === undefined) headers.host = url.host;
    if (headers['x-forwarded-proto'] === undefined) {
      headers['x-forwarded-proto'] = url.protocol.replace(/:$/, '');
    }
    // `URL` already decodes nothing in `pathname`; decode per segment, as Rack does.
    const path = decodePath(url.pathname);

    const response = handler({
      method: request.method,
      path,
      query: parseQuery(url.search.replace(/^\?/, '')),
      headers,
    });

    // `Response` throws on a body for a 204, even an empty one.
    const noBody = request.method.toUpperCase() === 'HEAD' || response.status === 204;
    return new Response(noBody ? null : response.body, {
      status: response.status,
      headers: response.headers,
    });
  };
}
