# Atlas production runbook

## Release gate

Every release must pass the frontend and backend CI jobs. Production deploys
must use Node.js 22, immutable application artifacts, and separate API and
worker processes built from the same commit.

Next.js currently requires tested dependency overrides for PostCSS and Sharp
because its stable package metadata pins older vulnerable lines. CI runs a
production-only dependency audit and must remain clean. Remove the overrides
once a stable Next.js release declares patched versions directly.

Before deploying:

1. Confirm the target commit passed `.github/workflows/ci.yml`.
2. Back up PostgreSQL and record the backup identifier.
3. Run `npm ci && npm run build` in the repository root and `backend/`.
4. Run `npm run db:migrate` from `backend/` as a one-off release task.
5. Start the API with `npm start` and the worker with `npm run start:worker`.
6. Require `/v1/health` for liveness and `/v1/ready` for readiness.

Do not send traffic to a release until readiness reports PostgreSQL and Redis
as available.

## Required production configuration

The API refuses to start when production URLs are local or unencrypted.
Production requires:

- HTTPS frontend, issuer, JWKS, and API audience URLs.
- A non-local PostgreSQL URL with `DATABASE_SSL_MODE=require` or
  `verify-full`.
- A non-local `rediss://` URL.
- A base64-encoded 32-byte `CONNECTOR_ENCRYPTION_KEY`.
- The exact `TRUST_PROXY_HOPS` count when a reverse proxy is present.

The API applies a Redis-backed distributed request limit and rejects bodies
larger than `API_MAX_BODY_BYTES`. Health probes bypass throttling. A Redis
failure fails closed for application traffic while `/v1/ready` reports the
dependency failure.

Prefer `verify-full` for PostgreSQL. Use `require` only when the platform
encrypts traffic but does not expose a usable CA chain.

## Database backup and restore

Create a compressed, checksummed backup before migrations:

```bash
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" --file atlas.dump
shasum -a 256 atlas.dump > atlas.dump.sha256
```

Store both files in encrypted object storage with access logging and a
retention policy. Never commit database dumps.

Restore drills must use an isolated empty database:

```bash
shasum -a 256 --check atlas.dump.sha256
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$RESTORE_DATABASE_URL" atlas.dump
```

After restoration, run migrations and verify `/v1/ready`, workspace counts,
connector records, and a representative impact report. Never point
`RESTORE_DATABASE_URL` at production.

## Rollback

Application rollback is performed by deploying the preceding immutable
artifact. Database migrations must be backward compatible with the preceding
application version. If a migration is not backward compatible, stop the
release and prepare an explicit forward-fix migration; do not edit an applied
migration.

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
