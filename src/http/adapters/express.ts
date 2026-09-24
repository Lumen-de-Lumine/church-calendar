// Express / NestJS (Express platform) middleware. `express` is NOT imported —
// the request and response are typed structurally, so this file compiles with
// zero dependencies and works with any Connect-style stack.

import { createHandler } from '../router.js';
import type { CreateHandlerOptions } from '../router.js';
import type { Handler } from '../types.js';
import { normalizeHeaders, splitTarget, withContentLength } from './common.js';

/** The slice of `express.Request` this adapter reads. */
export interface ExpressLikeRequest {
  method?: string;
  /** Express sets `originalUrl`; Connect only sets `url`. */
  url?: string;
  originalUrl?: string;
  /** Present when the app is mounted under a prefix (`app.use('/x', mw)`). */
  baseUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/** The slice of `express.Response` this adapter writes. */
export interface ExpressLikeResponse {
  writeHead(status: number, headers: Record<string, string>): unknown;
  end(body?: string): unknown;
}

export type NextFunction = (error?: unknown) => void;

export interface ExpressMiddlewareOptions extends CreateHandlerOptions {
  /**
   * Path prefix to strip before routing, for `app.use('/calendar', mw)`.
   * Defaults to the request's own `baseUrl`, which Express sets for you.
   */
  basePath?: string;
  /**
   * Call `next()` instead of answering when the router would 404. Useful when
   * the calendar is mounted inside a bigger app. Default `false`.
   */
  passThroughOnNotFound?: boolean;
}

/**
 * Builds `(req, res, next)` middleware.
 *
 * ```ts
 * app.use(createExpressMiddleware());                    // same paths as the Ruby service
 * app.use('/calendar', createExpressMiddleware());       // mounted under a prefix
 * ```
 */
export function createExpressMiddleware(
  options: ExpressMiddlewareOptions = {},
): (req: ExpressLikeRequest, res: ExpressLikeResponse, next: NextFunction) => void {
  const handler: Handler = createHandler(options);
  return createExpressMiddlewareFrom(handler, options);
}

/** Same, around a handler you already built. */
export function createExpressMiddlewareFrom(
  handler: Handler,
  options: ExpressMiddlewareOptions = {},
): (req: ExpressLikeRequest, res: ExpressLikeResponse, next: NextFunction) => void {
  return function calendarMiddleware(req, res, next): void {
    try {
      const target = req.originalUrl ?? req.url ?? '/';
      const base = options.basePath ?? req.baseUrl ?? '';
      const stripped =
        base && target.startsWith(base) ? target.slice(base.length) || '/' : target;
      const { path, query } = splitTarget(stripped);

      const response = handler({
        method: req.method ?? 'GET',
        path,
        query,
        headers: normalizeHeaders(Object.entries(req.headers ?? {})),
      });

      if (options.passThroughOnNotFound && response.status === 404) {
        next();
        return;
      }

      const body = response.body ?? '';
      const withLength = withContentLength(response, body);
      res.writeHead(withLength.status, withLength.headers);
      res.end(body);
    } catch (error) {
      next(error);
    }
  };
}
