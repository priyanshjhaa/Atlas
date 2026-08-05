FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73 AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runtime-base
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
ENV REPOSITORY_STORAGE_PATH=/var/lib/atlas/repositories

RUN mkdir -p /var/lib/atlas/repositories \
  && chown -R node:node /var/lib/atlas

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

FROM runtime-base AS api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/v1/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]

FROM runtime-base AS worker
CMD ["node", "dist/worker.js"]

FROM runtime-base AS migration
ENV MIGRATIONS_PATH=/app/drizzle
COPY --chown=node:node drizzle ./drizzle
CMD ["node", "dist/database/migrate.js"]
