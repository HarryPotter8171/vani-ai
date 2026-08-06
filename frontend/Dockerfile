# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# VANI AI — frontend (Next.js) production image
# Multi-stage: install -> build (standalone output) -> minimal runtime.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22-bookworm-slim

# --- deps ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time-only — safe defaults; override the real values at deploy time
# via the runtime environment (NextAuth/API URLs are also read at request time).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:5001/api
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_SENTRY_RELEASE=
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_RELEASE=${NEXT_PUBLIC_SENTRY_RELEASE} \
    NODE_ENV=production
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 vani \
    && useradd --system --uid 1001 --gid 1001 --home-dir /app vani

# `output: "standalone"` (next.config.ts) traces the minimal server + deps.
COPY --from=build --chown=vani:vani /app/.next/standalone ./
COPY --from=build --chown=vani:vani /app/.next/static ./.next/static
COPY --from=build --chown=vani:vani /app/public ./public

USER vani
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
