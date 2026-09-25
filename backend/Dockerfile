# Phase 14: production image for the NestJS API + Socket.IO server.
# Cloud-agnostic: runs on any container platform (Kubernetes, ECS, Cloud Run,
# Azure Container Apps, Fly, a plain VM with Docker, ...).
#
#   docker build -t dame-intel-backend ./backend
#   docker run --env-file backend/.env -p 3001:3001 dame-intel-backend
#
# Node 22 LTS on Debian slim (glibc) — bcrypt/sqlite3 ship prebuilt binaries for it.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    LOG_FORMAT=json
WORKDIR /app
# Run as the unprivileged "node" user that ships with the official image.
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3001
# Liveness only (no DB dependency) so a slow database never causes restart loops;
# point your platform's readiness/load-balancer check at GET /health instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Database migrations run automatically at boot (DB_MIGRATIONS_RUN=true by default).
CMD ["node", "dist/main.js"]
