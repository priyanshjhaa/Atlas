# Atlas Backend

NestJS API foundation for Atlas. The service is independently deployable from
the Next.js web application.

## Requirements

- Node.js 22.13 or newer
- Docker with Compose for local PostgreSQL and Redis

## Setup

```bash
cd backend
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:4000` by default.

```text
GET /v1/health
GET /v1/ready
```

## Quality commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`/v1/ready` validates both application configuration and PostgreSQL
connectivity. Redis connectivity will be included when background queues are
introduced.

## Database commands

```bash
npm run db:generate # generate a migration after changing schema.ts
npm run db:migrate  # apply pending migrations
npm run db:seed     # idempotently seed the local Northstar workspace
npm run db:studio   # inspect local data with Drizzle Studio
```
