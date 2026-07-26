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
GET /v1/workspaces/:workspaceId/connectors/github
POST /v1/workspaces/:workspaceId/connectors/github/installations
POST /v1/webhooks/github
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

## GitHub repository connector

Repository access uses a separate GitHub App; the GitHub OAuth app remains
limited to Atlas sign-in. Configure the GitHub App with:

- Setup URL: `http://localhost:3000/api/github/callback`
- Webhook URL: a public tunnel to `http://localhost:4000/v1/webhooks/github`
- Repository permissions: Contents (read) and Pull requests (read)
- Events: Installation and Installation repositories

Add the app ID, base64-encoded private key, webhook secret, and a base64-encoded
32-byte connector encryption key to `backend/.env`. Add the app slug as
`GITHUB_APP_SLUG` in the web application's `.env.local`.

Generate suitable encoded values with:

```bash
base64 < github-app.private-key.pem | tr -d '\n'
openssl rand -base64 32
```

GitHub installation access tokens are created only when needed and are not
stored. Installation metadata is encrypted with AES-256-GCM, webhook signatures
are verified against the raw request body, and delivery IDs are deduplicated.
