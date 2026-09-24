// Node `http` adapter — what `bin/server.mjs` and the container image use.

import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createHandler } from '../router.js';
import type { CreateHandlerOptions } from '../router.js';
import type { Handler, HttpRequest, HttpResponse } from '../types.js';
import { normalizeHeaders, splitTarget, withContentLength } from './common.js';

/** Turns a Node `IncomingMessage` into an {@link HttpRequest}. */
export function toHttpRequest(req: IncomingMessage): HttpRequest {
  const { path, query } = splitTarget(req.url ?? '/');
  return {
    method: req.method ?? 'GET',
    path,
    query,
    headers: normalizeHeaders(Object.entries(req.headers)),
  };
}

/** Writes an {@link HttpResponse} to a Node `ServerResponse`. */
export function sendHttpResponse(res: ServerResponse, response: HttpResponse): void {
  const body = response.body ?? '';
  const withLength = withContentLength(response, body);
  res.writeHead(withLength.status, withLength.headers);
  res.end(body);
}

export interface NodeServerOptions extends CreateHandlerOptions {
  /** Called once per finished request; set to `null` to silence the server. */
  log?: ((line: string) => void) | null;
}

/**
 * Builds a `node:http` server around a handler.
 *
 * `createServer()` with no argument builds the default handler; pass one in to
 * share a handler (and its repository) with something else.
 */
export function createServer(
  handlerOrOptions: Handler | NodeServerOptions = {},
  maybeOptions: NodeServerOptions = {},
): Server {
  const isHandler = typeof handlerOrOptions === 'function';
  const options: NodeServerOptions = isHandler ? maybeOptions : handlerOrOptions;
  const handler: Handler = isHandler ? handlerOrOptions : createHandler(options);
  const log = options.log === undefined ? defaultLog : options.log;

  return createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    let response: HttpResponse;
    try {
      response = handler(toHttpRequest(req));
      // Inside the try: `writeHead` throws on a header value it refuses, and a
      // throw here would otherwise take the whole process down.
      sendHttpResponse(res, response);
    } catch (error) {
      response = {
        status: 502,
        headers: { 'content-type': 'text/html' },
        body: '<h1>Incomplete response received from application</h1>',
      };
      if (log) log(`ERROR ${req.method} ${req.url} ${(error as Error).message}`);
      // `writeHead` validates every header before sending any, so normally nothing has gone out.
      if (res.headersSent) res.destroy();
      else sendHttpResponse(res, response);
    }
    if (log) {
      log(
        `${req.method ?? 'GET'} ${req.url ?? '/'} ${response.status} ` +
          `${response.body.length}b ${Date.now() - started}ms`,
      );
    }
  });
}

function defaultLog(line: string): void {
  // eslint-disable-next-line no-console
  console.log(line);
}
