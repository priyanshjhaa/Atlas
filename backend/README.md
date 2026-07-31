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
Run the synchronization worker in a second terminal:

```bash
cd backend
npm run dev:worker
```

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
GET /v1/workspaces/:workspaceId/sync-jobs
POST /v1/workspaces/:workspaceId/sync-jobs
POST /v1/workspaces/:workspaceId/sync-jobs/:syncJobId/cancel
POST /v1/workspaces/:workspaceId/sync-jobs/:syncJobId/retry
GET /v1/workspaces/:workspaceId/repositories/:repositoryId/intelligence/architecture
POST /v1/workspaces/:workspaceId/repositories/:repositoryId/intelligence/search
```

## Quality commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`/v1/ready` validates application configuration, PostgreSQL, and Redis
connectivity.

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

## Groq explanation budget

Groq's published free-plan limit for `openai/gpt-oss-120b` is currently 8,000
tokens per minute and 200,000 tokens per day. The exact organization limits in
the Groq console remain authoritative. Use this Atlas profile to leave room for
medium reasoning and the structured response while retaining the highest-ranked
evidence:

```text
LLM_PROVIDER=groq
LLM_EXPLANATION_MODEL=openai/gpt-oss-120b
LLM_MAX_EVIDENCE_ITEMS=8
LLM_MAX_EVIDENCE_CHARACTERS=6000
LLM_MAX_PACKET_CHARACTERS=7000
LLM_MAX_OUTPUT_TOKENS=3000
LLM_REASONING_EFFORT=medium
```

Atlas removes repository metadata duplicated inside findings and citations
before sending the provider request. A transient JSON-validation failure is
retried only when Groq's `x-ratelimit-remaining-tokens` response header reports
enough capacity for another complete request. See the
[Groq rate-limit documentation](https://console.groq.com/docs/rate-limits).

## Synchronization jobs

The API process produces `atlas-repository-sync` BullMQ jobs and the separate
worker process consumes them. PostgreSQL remains the authoritative source for
status and progress, while Redis coordinates delivery.

- A request-level idempotency key and an active-job database constraint prevent
  duplicate work.
- Failed jobs retry up to three times with exponential backoff.
- Cancellation requests are persisted so a separately deployed worker can
  observe them between processing stages.
- The worker compares the GitHub default-branch HEAD SHA with the last
  synchronized revision and reports `no_change` without repeating work.
- Queue, running, completed, failed, cancelled, retry, stage, progress, and
  diagnostic data are exposed to the Activity screen.

For Railway, deploy the same backend source as two services:

```text
API command: npm run start
Worker command: npm run start:worker
```

## Repository intelligence

The worker now runs the Atlas-owned CodeMap service fork after detecting a new
GitHub revision:

1. Download and safely extract the GitHub App archive into temporary storage.
2. Discover supported source files within file-count and byte limits.
3. Parse TypeScript/JavaScript symbols, imports, exports, and citation chunks.
4. Discover the repository `tsconfig.json`, apply its compiler options and file
   scope, traverse referenced project configs, build their TypeScript programs,
   and resolve imported declarations to repository files and symbols.
   Repositories without a config use safe TypeScript/JavaScript defaults.
5. Discover npm/Yarn, pnpm, and Lerna workspace packages, exports, entry points,
   and dependency declarations.
6. Extract observed local-import and workspace-package relationships with
   compiler evidence, confidence, configured path-alias support, and a
   syntax-only fallback for partially compilable repositories.
7. Persist stable package identities and exact manifest dependency links,
   including cross-repository links when a package name resolves uniquely
   inside the workspace. Ambiguous package names are not linked.
8. Persist line-independent symbol identities, import bindings, public export
   names, and package API ownership. Named package imports are linked to unique
   public symbols across repositories, including symbols exposed by re-exports.
9. Capture direct and namespace API calls, associate them with their containing
   source symbols, and persist revision-stamped call edges across repositories.
10. Append a revision-scoped observation for every local import, package
    dependency, public API import, and public API call so later graph analysis
    can distinguish current structure from relationships seen historically.
11. Generate deterministic local embeddings or optional OpenAI embeddings.
12. Atomically replace the repository index and create an architecture snapshot.

Workspace-scoped impact analysis consumes the indexed package, public API
import, and public API call edges to report observed consumers in other active
repositories. Each cross-repository finding keeps the consumer repository,
source revision, provenance, confidence, and evidence location; runtime,
event-driven, and external consumers remain explicit limitations.
When a revision history contains an incoming stable edge that is absent from
the current graph, impact analysis returns it as historical evidence with
reduced confidence and an explicit revalidation requirement. Historical edges
never masquerade as current observed consumers in reports or LLM explanations.

The exact source commit, included concepts, exclusions, and Atlas adaptations
are recorded in `src/intelligence/CODEMAP_FORK.md`. Atlas does not depend on the
CodeMap repository at runtime and does not automatically merge later CodeMap
changes.

Local embeddings are the default and require no external service:

```env
EMBEDDINGS_PROVIDER=local
```

To use OpenAI embeddings:

```env
EMBEDDINGS_PROVIDER=openai
OPENAI_API_KEY=...
```

The index is always tenant-scoped. Static relationships store source revision,
evidence, `typescript_static_import` provenance, confidence `1.0`, and whether
the target was resolved by the TypeScript type checker or the syntax fallback.
