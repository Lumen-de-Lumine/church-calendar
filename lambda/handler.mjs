/**
 * AWS Lambda entry point — API Gateway HTTP API (payload format 2.0) or a
 * Lambda Function URL.
 *
 * Package: `npm run build`, then zip `dist/`, `lambda/` and `package.json`.
 * There is nothing else to bundle: the library has zero runtime dependencies
 * and its data is compiled into `dist/data/`.
 *
 *   Handler:  lambda/handler.handler
 *   Runtime:  nodejs22.x (or newer)
 *   Memory:   256 MB is plenty; init is Node boot plus ~2 ms of data parsing
 *
 * Set `CALENDAR_STRIP_STAGE=1` when the function sits behind an API Gateway
 * stage other than `$default`.
 */

import { createLambdaHandler } from '../dist/http/adapters/lambda.js';

const calendar = createLambdaHandler({
  stripStage: process.env.CALENDAR_STRIP_STAGE === '1',
  absoluteRedirects: process.env.ABSOLUTE_REDIRECTS === '1',
});

/** @param {import('../dist/http/adapters/lambda.js').LambdaEventV2} event */
export const handler = async (event) => calendar(event);

export default { handler };
