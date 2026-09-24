# syntax=docker/dockerfile:1
#
# church-calendar -- a drop-in replacement for the Ruby `church-calendar-api`
# image. Same URLs, same JSON (byte-for-byte), same `cache-control` and CORS
# headers, same container port (80) and same probe path (`/`), so nothing that
# talks to the Ruby service has to change.
#
#   docker build -t church-calendar:<tag> .
#   docker run --rm -p 9292:80 church-calendar:<tag>
#
# The Ruby image is phusion/passenger-ruby26 with nginx + Passenger, which runs
# as root and needs extra Linux capabilities (NET_BIND_SERVICE, SETUID, SETGID,
# CHOWN, ...). This one is a single Node process as uid 1000 with no added
# capabilities.
#
# PORT 80 AS NON-ROOT: Docker >= 20.10 and every supported Kubernetes runtime set
# `net.ipv4.ip_unprivileged_port_start=0` inside the container, so uid 1000 may
# bind 80 without NET_BIND_SERVICE. If a runtime does not, run with
# `-e PORT=8080` and point the probe and service at 8080; nothing else changes.

# --- build -----------------------------------------------------------------
FROM node:26-alpine AS build

WORKDIR /build

# Dependencies first, so a source-only change reuses this layer. The package has
# ZERO runtime dependencies -- everything installed here is TypeScript tooling,
# and none of it reaches the runtime stage. `--ignore-scripts` keeps the
# `prepare` script from building before src/ is here; `npm run build` below does.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund --prefer-offline --no-progress

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- runtime ---------------------------------------------------------------
FROM node:26-alpine AS runtime

# tini as PID 1: a crash exits the container so the orchestrator sees it, and
# no process is left unreaped.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=80 \
    HOST=0.0.0.0

WORKDIR /app

COPY --chown=1000:1000 package.json ./
COPY --chown=1000:1000 bin ./bin
COPY --chown=1000:1000 --from=build /build/dist ./dist

# The `node` user that node:alpine already ships.
USER 1000

EXPOSE 80

# `/` is the Roda index page, which is what a Ruby deployment probes, so an
# existing readiness probe does not change either.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||80)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "bin/server.mjs"]
