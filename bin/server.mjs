#!/usr/bin/env node
/**
 * Standalone HTTP server — the drop-in replacement for the Ruby
 * `sourceandsummit/church-calendar-api:2.7.0` container.
 *
 *   PORT   listen port (default 9292, the Rack/Puma default the Ruby image used)
 *   HOST   bind address (default 0.0.0.0)
 *   LOG    set to `off` to silence the per-request log line
 *   ABSOLUTE_REDIRECTS  set to `1` to emit absolute 301 Location headers
 *                       (the Ruby service emits RELATIVE ones; default off)
 *
 * Run it from the built `dist/` (`npm run build` first):
 *
 *   PORT=9393 node bin/server.mjs
 */

import { createServer } from '../dist/http/adapters/node.js';

const port = Number.parseInt(process.env.PORT ?? '9292', 10);
const host = process.env.HOST ?? '0.0.0.0';
const silent = (process.env.LOG ?? '').toLowerCase() === 'off';

const server = createServer({
  absoluteRedirects: process.env.ABSOLUTE_REDIRECTS === '1',
  log: silent ? null : (line) => process.stdout.write(`${new Date().toISOString()} ${line}\n`),
});

server.listen(port, host, () => {
  if (!silent) {
    process.stdout.write(
      `${new Date().toISOString()} church-calendar listening on http://${host}:${port}\n`,
    );
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    // Do not let a keep-alive connection hold the pod open past its grace period.
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
