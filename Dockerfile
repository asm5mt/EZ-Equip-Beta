# EZ-EQUIP — production image
#
# Multi-stage build. Stage 1 installs all deps and builds; stage 2 ships only
# the compiled bundle and runtime deps.

# ---------- Stage 1: build ----------
FROM node:20-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 is a devDependency (used only by the one-off
# scripts/migrate_sqlite_to_postgres.ts data-migration script) and needs
# Python + build tools to compile if no prebuilt binary matches this image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Runtime needs only production deps (pg is pure JS, no native build tools required).
COPY package.json package-lock.json* ./
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && npm ci --omit=dev \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
