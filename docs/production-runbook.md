# Atlas production runbook

## Release gate

Every release must pass the frontend, browser acceptance, backend, and
production-container CI jobs. Production deploys must use Node.js 22,
immutable application artifacts, and separate API and worker processes built
from the same commit.

Next.js currently requires tested dependency overrides for PostCSS and Sharp
because its stable package metadata pins older vulnerable lines. CI runs a
production-only dependency audit and must remain clean. Remove the overrides
once a stable Next.js release declares patched versions directly.

Before deploying:

1. Confirm the target commit passed `.github/workflows/ci.yml`.
2. Back up PostgreSQL and record the backup identifier.
3. Run `npm ci && npm run build` in the repository root and `backend/`.
4. Build immutable `runtime`, `api`, `worker`, and `migration` container
   targets from the release commit.
5. Run the migration target as a one-off release task.
6. Start the web, API, and worker targets from the same release identifier.
7. Require `/v1/health` for liveness and `/v1/ready` for readiness.

Do not send traffic to a release until readiness reports PostgreSQL and Redis
as available.

The reference deployment is `compose.production.yaml`. Populate its required
variables from a secret manager, then run:

```bash
docker compose -f compose.production.yaml --profile tools run --rm migrate
docker compose -f compose.production.yaml up -d web api worker
docker compose -f compose.production.yaml ps
```

The frontend uses `BACKEND_URL` as the public JWT audience and
`BACKEND_INTERNAL_URL` for server-to-server API traffic. The API and worker
share a persistent repository volume but run as separate non-root processes.
Do not move these processes to a platform that only supports service-local
volumes until repository checkout storage has been redesigned or an equivalent
shared filesystem has been provisioned.

Before promoting a release, run the same container acceptance used by CI:

```bash
./scripts/operations/container-acceptance.sh
```

It builds all deployment targets, applies migrations, checks liveness,
readiness, internal routing, and protected diagnostics, completes a real
isolated backup/restore drill, and requires clean web, API, and worker
shutdowns. The acceptance allows a zero exit or the conventional SIGTERM exit
code 143 and rejects forced termination (137).

## Required production configuration

The API refuses to start when production URLs are local or unencrypted.
Production requires:

- HTTPS frontend, issuer, JWKS, and API audience URLs.
- A non-local PostgreSQL URL with `DATABASE_SSL_MODE=require` or
  `verify-full`.
- A non-local `rediss://` URL.
- A base64-encoded 32-byte `CONNECTOR_ENCRYPTION_KEY`.
- A dedicated 32-character-or-longer `OPERATIONS_TOKEN`.
- The exact `TRUST_PROXY_HOPS` count when a reverse proxy is present.

The API applies a Redis-backed distributed request limit and rejects bodies
larger than `API_MAX_BODY_BYTES`. Health probes bypass throttling. A Redis
failure fails closed for application traffic while `/v1/ready` reports the
dependency failure.

Prefer `verify-full` for PostgreSQL. Use `require` only when the platform
encrypts traffic but does not expose a usable CA chain.

## Operational diagnostics

`GET /v1/diagnostics` requires
`Authorization: Bearer <OPERATIONS_TOKEN>` and bypasses the application rate
limiter so it remains available while Redis is degraded. Restrict it at the
network edge as well as with the token.

The response contains only the release identifier, process uptime and memory
totals, aggregate GitHub and Notion queue counts, and process-local explanation
outcomes. It excludes environment values, URLs, credentials, prompts,
workspace identifiers, repository identifiers, and connector metadata.

Treat `status: degraded` or an unavailable queue as an alert. Queue failure
counts and explanation fallback counts should be monitored as rates rather
than as raw lifetime totals. Because diagnostics are process-local, collect
them from every API replica.

## Database backup and restore

Create a private, compressed, checksummed backup before migrations:

```bash
ATLAS_RELEASE="$ATLAS_RELEASE" \
  BACKUP_DIR=./backups \
  ./scripts/operations/database-backup.sh
```

Store both files in encrypted object storage with access logging and a
retention policy. Record the object version, checksum, source release, and
database engine version. Never commit database dumps or leave the only copy on
the deployment host.

Restore drills must use an isolated empty database:

```bash
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
  BACKUP_FILE=./backups/atlas-<timestamp>-<release>.dump \
  RESTORE_CONFIRMATION=restore-isolated-database \
  ./scripts/operations/database-restore.sh
```

After restoration, run migrations and verify `/v1/ready`, workspace counts,
connector records, and a representative impact report. Never point
`RESTORE_DATABASE_URL` at production. The restore script verifies the checksum
and refuses an exact match with `DATABASE_URL`.

Run a restore drill at least quarterly and before changing the database engine
or backup policy. Record recovery-point and recovery-time results.

## Migration procedure

1. Confirm every migration is additive or otherwise compatible with the
   preceding application release.
2. Capture and upload a verified database backup.
3. Stop the release if the backup identifier or checksum is missing.
4. Run the release's immutable migration image exactly once.
5. Confirm it exits successfully, then start the new API and worker images.
6. Check `/v1/ready` and compare workspace, repository, connector, and impact
   report counts with the pre-deploy record.
7. Resume synchronization only after the verification owner signs off.

## Rollback

Application rollback is performed by deploying the preceding immutable
artifact. Database migrations must be backward compatible with the preceding
application version. If a migration is not backward compatible, stop the
release and prepare an explicit forward-fix migration; do not edit an applied
migration.

For a release-related failure:

1. Stop traffic promotion and pause workers if writes could compound impact.
2. Capture the failed release logs and active migration journal.
3. Redeploy the preceding web, API, and worker image tags without rerunning
   migrations.
4. Confirm liveness, readiness, authentication, connector state, and a
   representative impact analysis.
5. Prefer a forward-fix migration. Restore a backup only for confirmed data
   corruption and only after preserving the failed database for investigation.

## Incident response

1. Stop new deploys and record the first observed failure time.
2. Check API and worker structured logs by request, workspace, sync job, and
   report identifiers. Credentials, authorization headers, signatures, raw
   URLs, and query values are redacted; use `requestPath` for safe routing
   context.
3. Check `/v1/ready`, database saturation, Redis availability, sync failures,
   and LLM fallback counts.
4. Revoke compromised connector credentials and rotate
   `CONNECTOR_ENCRYPTION_KEY` only through a planned re-encryption procedure.
5. Roll back the application when the failure is release-related.
6. Record impact, timeline, resolution, and follow-up controls.

Use `docs/incident-template.md` as the incident record. Do not paste secrets,
authorization headers, provider tokens, raw OAuth callback URLs, or database
URLs into tickets or chat.
