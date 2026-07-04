# EZ-EQUIP — production image
#
# Multi-stage build. Stage 1 installs all deps and builds; stage 2 ships only
# the compiled bundle and runtime deps.

# ---------- Stage 1: build ----------
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Native better-sqlite3 needs Python + build tools.
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
# Persist the SQLite database in a mounted volume.
ENV EZ_EQUIP_DB_PATH=/data/ez-equip.db

# Runtime needs only production deps. Copy package files first for cache.
COPY package.json package-lock.json* ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && npm ci --omit=dev \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
