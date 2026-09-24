// The HTTP layer: one framework-agnostic handler plus four thin adapters.

export { createHandler } from './router.js';
export type { CreateHandlerOptions } from './router.js';
export type { Handler, HandlerOptions, HttpRequest, HttpResponse, QueryValue } from './types.js';

export {
  formatCompact,
  formatEntity,
  formatEntityArray,
  formatError,
  formatPlain,
  formatString,
} from './json.js';
export type { JsonValue } from './json.js';

export { renderSwaggerYml } from './swagger.js';
export type { SwaggerLocals } from './swagger.js';

export {
  LANGS,
  PARAMETERS,
  STYLE_CSS,
  aboutView,
  apiDocView,
  browseView,
  indexView,
  layout,
  monthView,
} from './web.js';
export type { BrowseLocals, MonthLocals } from './web.js';

export { byteLength, normalizeHeaders, parseQuery, splitTarget } from './adapters/common.js';
export { createServer, sendHttpResponse, toHttpRequest } from './adapters/node.js';
export type { NodeServerOptions } from './adapters/node.js';
export { createExpressMiddleware, createExpressMiddlewareFrom } from './adapters/express.js';
export type {
  ExpressLikeRequest,
  ExpressLikeResponse,
  ExpressMiddlewareOptions,
  NextFunction,
} from './adapters/express.js';
export { createLambdaHandler, createLambdaHandlerFrom } from './adapters/lambda.js';
export type { LambdaAdapterOptions, LambdaEventV2, LambdaResultV2 } from './adapters/lambda.js';
export { createFetchHandler, createFetchHandlerFrom } from './adapters/fetch.js';
