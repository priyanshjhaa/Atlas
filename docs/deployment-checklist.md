# Atlas deployment checklist

This checklist intentionally excludes credential values. Complete the deferred
sections only after the production host, domains, databases, and provider
integrations have been created. Store every secret in the deployment platform's
secret manager; never paste production values into tracked files.

## Locally completed release preparation

- [x] Frontend and backend typecheck, lint, tests, and production builds pass.
- [x] Production-only dependency audits pass.
- [x] Functional browser and Lighthouse acceptance run in CI.
- [x] Web, API, worker, and migration container targets exist.
- [x] Container liveness, readiness, protected diagnostics, migration,
      backup/restore, and graceful shutdown acceptance pass.
- [x] Production configuration rejects local or insecure service URLs.
- [x] The release runbook, rollback process, and incident template exist.
- [x] Environment files containing credentials are ignored.

## Infrastructure decisions

- [ ] Select the production container host and region.
- [ ] Preserve shared `REPOSITORY_STORAGE_PATH` access for the API and worker.
      The current reference is one container host using
      `compose.production.yaml`.
- [ ] Provision PostgreSQL with the `pgvector` extension and TLS.
- [ ] Provision Redis with TLS and a persistence policy appropriate for BullMQ.
- [ ] Provision encrypted backup storage outside the application host.
- [ ] Create staging and production environments with isolated databases,
      Redis instances, secrets, domains, and connector registrations.
- [ ] Decide the public software license, or explicitly keep the repository
      unlicensed.

## Domains and network

- [ ] Configure the production web domain and HTTPS certificate.
- [ ] Configure the public API domain and HTTPS certificate.
- [ ] Restrict PostgreSQL and Redis to the application network.
- [ ] Restrict `/v1/diagnostics` at the network edge in addition to its token.
- [ ] Set the exact trusted reverse-proxy hop count.
- [ ] Confirm the API and worker share the repository storage mount.
- [ ] Confirm the worker and databases are not publicly exposed.

## Production secrets and variables

Generate or obtain these values only after the production environment exists:

- [ ] `BETTER_AUTH_SECRET`
- [ ] `BETTER_AUTH_URL`
- [ ] `BACKEND_URL`
- [ ] `BACKEND_INTERNAL_URL`
- [ ] `DATABASE_URL`
- [ ] `DATABASE_SSL_MODE`
- [ ] `REDIS_URL`
- [ ] `AUTH_JWKS_URL`
- [ ] `AUTH_ISSUER`
- [ ] `AUTH_AUDIENCE`
- [ ] `CONNECTOR_ENCRYPTION_KEY`
- [ ] `OPERATIONS_TOKEN`
- [ ] `ATLAS_RELEASE`
- [ ] GitHub OAuth client ID and client secret
- [ ] GitHub App ID, slug, private key, and webhook secret
- [ ] Notion OAuth client ID and client secret
- [ ] LLM provider key, primary model, and fallback model

Review `.env.example`, `backend/.env.example`, and
`docs/production-runbook.md` for the complete configuration contract and
validation rules.

## Provider configuration

- [ ] Register the production GitHub OAuth callback:
      `https://<web-domain>/api/auth/callback/github`.
- [ ] Configure the GitHub App installation URL and production webhook URL.
- [ ] Subscribe the GitHub App only to the events Atlas processes.
- [ ] Register the production Notion redirect:
      `https://<web-domain>/api/notion/callback`.
- [ ] Confirm GitHub and Notion permissions follow least privilege.
- [ ] Confirm the selected LLM models are available for the production Groq
      account and have sufficient usage limits.

## Repository controls

- [ ] Require pull requests for `main`.
- [ ] Require the frontend, browser acceptance, backend, and
      production-container checks.
- [ ] Prevent force pushes and branch deletion on `main`.
- [ ] Require review from CODEOWNERS when additional maintainers join.
- [ ] Enable private vulnerability reporting and dependency security alerts.

## Staging deployment

- [ ] Deploy the exact release commit to staging.
- [ ] Capture and store a verified pre-migration database backup.
- [ ] Run the immutable migration target once.
- [ ] Verify `/v1/health`, `/v1/ready`, and authenticated `/v1/diagnostics`.
- [ ] Complete GitHub sign-in and GitHub App installation.
- [ ] Synchronize a representative repository twice and verify the second run
      is incremental.
- [ ] Analyze both a planned change and a real pull request.
- [ ] Complete Notion OAuth, resource selection, initial sync, and incremental
      resync.
- [ ] Verify prompt-injection rejection and safe malicious-text handling.
- [ ] Force a transient primary-model failure and verify the fallback model.
- [ ] Verify rate limiting, request-size limits, and authorization boundaries.
- [ ] Run a staging backup and isolated restore drill.
- [ ] Confirm logs and diagnostics do not contain credentials or source text
      that should remain private.

## Production release

- [ ] Confirm every required CI check passed for the release commit.
- [ ] Record the release identifier, approver, backup identifier, and checksum.
- [ ] Run the production migration target exactly once.
- [ ] Start web, API, and worker from the same immutable release.
- [ ] Verify readiness before directing traffic to the release.
- [ ] Run authentication, GitHub, Notion, and representative impact-analysis
      smoke tests.
- [ ] Enable scheduled backups and complete the first verified backup.
- [ ] Configure uptime, readiness, queue-failure, explanation-fallback,
      database, Redis, disk, and certificate-expiration alerts.
- [ ] Confirm the documented rollback artifact remains available.
- [ ] Record the deployment outcome and any follow-up work.

