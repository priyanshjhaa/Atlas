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
GET /v1/me
POST /v1/workspaces
GET /v1/workspaces/:workspaceId
PATCH /v1/workspaces/:workspaceId
GET /v1/workspaces/:workspaceId/members
POST /v1/workspaces/:workspaceId/members
PATCH /v1/workspaces/:workspaceId/members/:memberId
DELETE /v1/workspaces/:workspaceId/members/:memberId
GET /v1/workspaces/:workspaceId/repositories
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

## Authentication boundary

The Next.js application owns GitHub sign-in and Better Auth sessions. It
publishes signing keys at `GET /api/auth/jwks` and issues short-lived JWTs for
the independently deployed NestJS API.

Protected API requests use:

```text
Authorization: Bearer <better-auth-jwt>
```

NestJS verifies the JWT issuer, audience, signature, and expiry, then validates
the referenced session against PostgreSQL. Deleting or revoking the Better Auth
session therefore invalidates API access immediately, even if the JWT has time
remaining.

Workspace-protected endpoints additionally require:

```text
X-Atlas-Workspace-Id: <workspace-uuid>
```

Controllers declare accepted roles with `@WorkspaceRoles(...)`. Public routes
must be explicitly marked with `@Public()`.
