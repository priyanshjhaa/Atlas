# Atlas

Atlas is an engineering-intelligence platform that connects GitHub code and
change history with Notion decisions and documentation. It builds a living
engineering graph and produces evidence-backed impact reports before a team
ships a proposed change or pull request.

## What is implemented

- GitHub OAuth sign-in and GitHub App repository access.
- Repository, commit, pull-request, review, and bounded-history ingestion.
- Notion OAuth, resource selection, document ingestion, and incremental sync.
- Cross-repository code, symbol, dependency, and architecture graphs.
- Planned-change and pull-request impact analysis with persisted evidence.
- LLM explanations with prompt-injection filtering, bounded context, provider
  timeouts, and Groq fallback-model support.
- Low, medium, and high change-risk presentation.
- Search, synchronization activity, operational diagnostics, pilot metrics,
  feedback collection, and retention controls.
- Responsive authenticated and marketing experiences.

Authenticated product routes load workspace data from the Atlas API. The public
landing page uses a small, explicitly illustrative topology to explain the
product before sign-in.

## Architecture

Atlas is a single repository containing:

- A Next.js web application in the repository root.
- A NestJS API and BullMQ worker under `backend/`.
- PostgreSQL with `pgvector` for product data and indexed intelligence.
- Redis for synchronization queues and distributed request limiting.
- Separate production image targets for web, API, worker, and migrations.

The API and worker run as separate processes from the same release and share
`REPOSITORY_STORAGE_PATH` for synchronized repository checkouts. The reference
production topology is defined in `compose.production.yaml`.

## Local development

Requirements:

- Node.js 22 or newer.
- Docker with Compose.

Install dependencies and create local environment files:

```bash
npm ci
cp .env.example .env.local

cd backend
npm ci
cp .env.example .env
docker compose up -d postgres redis
npm run db:migrate
cd ..
```

Start these processes in separate terminals:

```bash
npm run dev
```

```bash
cd backend
npm run dev
```

```bash
cd backend
npm run dev:worker
```

Local OAuth credentials are needed to exercise live GitHub and Notion
connections. Unit tests, builds, unauthenticated browser acceptance, and
container acceptance use isolated test configuration instead.

## Authentication and connectors

Atlas uses Better Auth with GitHub as its sign-in provider. Login requests only
profile and email access; repository ingestion is authorized separately through
a GitHub App.

For local GitHub sign-in, configure the OAuth callback:

```text
http://localhost:3000/api/auth/callback/github
```

For local Notion OAuth, configure:

```text
http://localhost:3000/api/notion/callback
```

Copy the example environment files and fill only the credentials needed for the
connector being tested. Never commit `.env`, `.env.local`, provider tokens,
private keys, webhook secrets, or database URLs.

## Quality gates

Frontend:

```bash
npm audit --omit=dev --audit-level=high
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:lighthouse
```

Backend:

```bash
cd backend
npm audit --omit=dev --audit-level=high
npm run typecheck
npm run lint
npm test
npm run acceptance:rate-limit
npm run build
```

Production container and recovery acceptance:

```bash
./scripts/operations/container-acceptance.sh
```

The container suite builds all release targets, applies migrations, checks
liveness and readiness, exercises protected diagnostics, performs an isolated
backup and restore, and verifies graceful shutdown.

## Product routes

- `/` — product landing page.
- `/sign-in` — GitHub sign-in.
- `/app` — protected workspace overview.
- `/app/impact/new` — planned-change and pull-request input.
- `/app/impact/:reportId` — persisted impact report.
- `/app/graph` — engineering knowledge graph.
- `/app/architecture` — architecture explorer.
- `/app/search` — engineering search.
- `/app/sources` — GitHub and Notion connectors.
- `/app/activity` — synchronization jobs and progress.
- `/app/settings` — workspace settings.

## Deployment

The currently tested deployment reference is a container host running
`compose.production.yaml`. It preserves the shared repository volume required
by the API and worker without changing the storage architecture.

Production credentials and URLs are intentionally not stored in this
repository. They must be supplied from the deployment platform's secret
manager when the production domain, PostgreSQL, Redis, GitHub App, Notion
integration, and LLM provider are provisioned.

Read [the production runbook](docs/production-runbook.md) before deploying. It
defines the release gate, required configuration, migration order, diagnostics,
backup and restore procedure, rollback, and incident response.

Atlas contains a documented one-time fork of selected repository-intelligence
services and has no runtime dependency on CodeMap.
