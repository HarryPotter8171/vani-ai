# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# VANI AI — backend production image
#
# Multi-stage build:
#   deps    — install production dependencies only (cacheable layer)
#   runtime — copy deps + source, install Playwright's Chromium (browser
#             automation), drop root, run as an unprivileged user under
#             `dumb-init` so SIGTERM/SIGINT reach server.js's graceful
#             shutdown handlers instead of being swallowed by PID 1.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22-bookworm-slim
# Slim defaults for Public Beta — enable explicitly for full feature images:
#   --build-arg INSTALL_BROWSER_AUTOMATION=true
#   --build-arg INSTALL_CODE_INTERPRETER=true
ARG INSTALL_BROWSER_AUTOMATION=false

# --- deps -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# Skip Playwright browser download during npm ci — Chromium is installed in
# the runtime stage with OS dependencies via `playwright install --with-deps`.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- runtime ------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
ARG INSTALL_BROWSER_AUTOMATION
ENV NODE_ENV=production \
    PORT=5001

ARG INSTALL_CODE_INTERPRETER=false

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      dumb-init \
      python3 \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Installs the Chromium build matching the pinned `playwright` npm version
# plus its OS-level dependencies. Only needed when browser automation
# (VANI_ENABLE_BROWSER_AUTOMATION=true at runtime) is used — skip it with
# `--build-arg INSTALL_BROWSER_AUTOMATION=false` for a leaner image.
RUN if [ "$INSTALL_BROWSER_AUTOMATION" = "true" ]; then \
      npx --yes playwright install --with-deps chromium; \
    fi

# Code Interpreter sandbox packages (pandas / numpy / matplotlib / …).
# Skip with `--build-arg INSTALL_CODE_INTERPRETER=false` for a leaner image.
RUN if [ "$INSTALL_CODE_INTERPRETER" = "true" ]; then \
      pip3 install --no-cache-dir --break-system-packages \
        -r requirements-code-interpreter.txt; \
    fi

RUN groupadd --system --gid 1001 vani \
    && useradd --system --uid 1001 --gid 1001 --home-dir /app vani \
    && mkdir -p uploads .browser-data .code-interpreter \
    && chown -R vani:vani /app

USER vani

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5001)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# dumb-init forwards signals correctly (PID 1 problem) so SIGTERM/SIGINT
# reach server.js's graceful shutdown handlers.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
