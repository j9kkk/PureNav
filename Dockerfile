# syntax=docker/dockerfile:1.7

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Toolchain for native modules (better-sqlite3) when no prebuilt binary matches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Manifests first so dependency layers survive source-only changes.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY apps ./apps
RUN npm run build -w @purenav/web \
 && npm run build -w @purenav/server

# ---------- production dependencies ----------
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# Only the server workspace in production: no React, no Vite.
RUN npm ci --omit=dev -w @purenav/server --no-audit --no-fund \
 && npm cache clean --force

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PURE_DATA_DIR=/data \
    PURE_WEB_DIST=/app/web-dist \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app

# node user (uid 1000) already exists in the official image.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=node:node /app/apps/web/dist ./web-dist

RUN mkdir -p /data && chown -R node:node /data /app

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form keeps node as PID 1 so SIGTERM reaches the graceful shutdown handler.
CMD ["node", "apps/server/dist/index.js"]
