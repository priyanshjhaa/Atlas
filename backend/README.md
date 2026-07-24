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

Readiness currently validates application configuration only. PostgreSQL and
Redis readiness checks will be added with the database foundation milestone.
