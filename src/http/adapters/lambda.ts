// AWS Lambda adapter for API Gateway HTTP API (payload format 2.0) and Lambda
// Function URLs, which share the same event shape. Types are declared here
// rather than imported from `@types/aws-lambda`, to keep the package dependency-
// free; they are structurally compatible with it.
//
// Responses are always UTF-8 text (JSON, HTML, CSS, YAML), so `isBase64Encoded`
// is never set.

import { createHandler } from '../router.js';
import type { CreateHandlerOptions } from '../router.js';
import type { Handler } from '../types.js';
import { parseQuery, splitTarget } from './common.js';

/** API Gateway HTTP API v2 / Function URL event (the fields this adapter reads). */
export interface LambdaEventV2 {
  version?: string;
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: {
    http?: { method?: string; path?: string };
    stage?: string;
  };
}

export interface LambdaResultV2 {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

export interface LambdaAdapterOptions extends CreateHandlerOptions {
  /**
   * Strip the API Gateway stage from `rawPath` (`/prod/api/...` -> `/api/...`).
   * Default `false`; Function URLs and `$default` stages do not need it.
   */
  stripStage?: boolean;
}

/** Builds the Lambda entry point. */
export function createLambdaHandler(
  options: LambdaAdapterOptions = {},
): (event: LambdaEventV2) => LambdaResultV2 {
  return createLambdaHandlerFrom(createHandler(options), options);
}

/** Same, around a handler you already built. */
export function createLambdaHandlerFrom(
  handler: Handler,
  options: LambdaAdapterOptions = {},
): (event: LambdaEventV2) => LambdaResultV2 {
  return function lambdaHandler(event: LambdaEventV2): LambdaResultV2 {
    const method = event.requestContext?.http?.method ?? 'GET';
    const stage = event.requestContext?.stage;

    let rawPath = event.rawPath ?? event.requestContext?.http?.path ?? '/';
    if (options.stripStage && stage && stage !== '$default' && rawPath.startsWith(`/${stage}`)) {
      rawPath = rawPath.slice(stage.length + 1) || '/';
    }

    const { path } = splitTarget(rawPath);
    const query =
      event.rawQueryString !== undefined && event.rawQueryString !== ''
        ? parseQuery(event.rawQueryString)
        : fromQueryStringParameters(event.queryStringParameters);

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(event.headers ?? {})) {
      if (value !== undefined) headers[name.toLowerCase()] = value;
    }

    const response = handler({ method, path, query, headers });
    return {
      statusCode: response.status,
      headers: response.headers,
      body: response.body,
      isBase64Encoded: false,
    };
  };
}

function fromQueryStringParameters(
  params: Record<string, string | undefined> | undefined,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    // API Gateway joins repeated keys with a comma; rawQueryString is preferred
    // exactly because it keeps them apart.
    if (value !== undefined) out[key] = value;
  }
  return out;
}
