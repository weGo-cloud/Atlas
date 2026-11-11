# ---- build ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Atlas opens SQLite at import time, so `next build` needs a throwaway,
# migrated DB. It is NOT shipped in the final image.
RUN mkdir -p db && DATABASE_URL=file:./db/build.db npx drizzle-kit migrate \
    && DATABASE_URL=file:./db/build.db npm run build

# ---- run ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/atlas.db \
    VEHICLE_PHOTO_STORAGE_DIR=/data/vehicle-photos \
    FURNITURE_PHOTO_STORAGE_DIR=/data/furniture-photos \
    SOCIAL_POST_STORAGE_DIR=/data/social-posts
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown node:node /data

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Migrations + the drizzle runtime (standalone bundles drizzle-orm away)
COPY --from=builder --chown=node:node /app/src/lib/db/migrations ./migrations
COPY --from=builder --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --chown=node:node scripts/migrate.mjs ./migrate.mjs
COPY --chown=node:node scripts/create-owner.mjs ./create-owner.mjs
COPY --chown=node:node scripts/ai-usage.mjs ./ai-usage.mjs

USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node migrate.mjs && node server.js"]
