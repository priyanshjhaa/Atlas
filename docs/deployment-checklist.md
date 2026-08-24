# Atlas deployment checklist

This checklist intentionally excludes credential values. Complete the deferred
sections only after the production host, domains, databases, and provider
integrations have been created. Store every secret in the deployment platform's
secret manager; never paste production values into tracked files.

## Recommended deployment order

Atlas needs four production services. Vercel hosts the Next.js web application;
Neon hosts PostgreSQL only; a Redis provider runs queues and distributed rate
limits; and a container host runs the NestJS API and BullMQ worker. Neon cannot
host the backend application processes.

### 1. Freeze and identify the release

- [ ] Merge an approved commit to the protected release branch.
- [ ] Confirm the frontend and backend CI jobs pass for that exact commit.
- [ ] Set `ATLAS_RELEASE` to the immutable commit SHA or release tag.
- [ ] Record an owner for deployment, rollback, database migration, and smoke
      testing.

### 2. Create the Vercel web project

- [ ] Import the repository into Vercel with the repository root as the project
      root and Node.js 22 as the runtime.
- [ ] Keep the framework preset as Next.js, build command as `npm run build`,
      and install command as `npm ci`.
- [ ] Assign the production web domain, but do not promote production traffic
      until the API readiness check passes.
- [ ] Reserve the final HTTPS URL as `https://<web-domain>` for auth, CORS, and
      OAuth configuration.

### 3. Provision PostgreSQL on Neon

- [ ] Create isolated Neon projects or branches for staging and production in
      the same region as the backend host.
- [ ] Store the TLS-enabled connection string as `DATABASE_URL`; never commit
      it or expose it to browser-side variables.
- [ ] Set backend `DATABASE_SSL_MODE=verify-full` when the supplied certificate
      chain supports it, otherwise use `require` and document why.
- [ ] Confirm the database role can create the `vector` extension. Atlas's first
      migration runs `CREATE EXTENSION IF NOT EXISTS vector`.
- [ ] Configure Neon backups or point-in-time recovery and record the retention
      window.

### 4. Provision Redis

- [ ] Create isolated staging and production Redis instances near the backend.
- [ ] Require TLS and store a `rediss://` connection string as `REDIS_URL`.
- [ ] Choose a persistence and eviction policy suitable for BullMQ; do not use
      an instance that evicts queue keys under normal load.
- [ ] Confirm the provider supports the connection count required by the API
      and worker together.

### 5. Deploy the backend API and worker

- [ ] Choose a container host that can give the API and worker the same
      persistent `REPOSITORY_STORAGE_PATH`. The safest current topology is one
      host running `compose.production.yaml` with the shared
      `atlas_repository_data` volume.
- [ ] Build the `api`, `worker`, and `migration` targets from the same release
      commit. Run API and worker as separate processes.
- [ ] Configure the public API domain as `https://<api-domain>` and expose only
      API port 4000 through HTTPS. Do not expose the worker or shared volume.
- [ ] Set `FRONTEND_ORIGIN`, `AUTH_ISSUER`, and `AUTH_JWKS_URL` to the final
      Vercel web URL. Set `AUTH_AUDIENCE` to the public API URL.
- [ ] Add the remaining backend variables from `backend/.env.example`, including
      connector, LLM, rate-limit, encryption, operations, and release values.
- [ ] Capture a verified database backup, then run the `migration` image exactly
      once before starting the new API and worker.
- [ ] Verify `GET https://<api-domain>/v1/health` and `/v1/ready` both return
      HTTP 200 before continuing.

### 6. Configure and deploy the Vercel web application

- [ ] Add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`, GitHub OAuth
      values, `GITHUB_APP_SLUG`, and the Notion client values to Vercel's
      encrypted production environment.
- [ ] Set `BACKEND_URL=https://<api-domain>`. Set `BACKEND_INTERNAL_URL` to the
      same value unless the host provides a secure private API URL reachable
      from Vercel.
- [ ] Deploy the same release commit used by the API and worker.
- [ ] Verify `/`, `/sign-in`, and `/api/auth/jwks` over the production domain.
- [ ] Confirm no secret is prefixed with `NEXT_PUBLIC_` or included in build
      output.

### 7. Configure GitHub and Notion callbacks

- [ ] Set the GitHub OAuth callback to
      `https://<web-domain>/api/auth/callback/github`.
- [ ] Set the GitHub App setup URL to
      `https://<web-domain>/api/github/callback` and webhook URL to
      `https://<api-domain>/v1/webhooks/github`.
- [ ] Set the Notion OAuth redirect to
      `https://<web-domain>/api/notion/callback`.
- [ ] Confirm the configured values exactly match the frontend and backend
      environment variables, including scheme and trailing-slash behavior.

### 8. Run production smoke tests

- [ ] Sign in through GitHub and complete onboarding.
- [ ] Install the GitHub App, synchronize one representative repository, and
      confirm the worker completes the job.
- [ ] Run the same synchronization again and confirm it is incremental.
- [ ] Connect Notion, select a test resource, and complete a sync.
- [ ] Run one planned-change analysis and one pull-request analysis; inspect
      evidence, unknowns, recommendations, and the verification plan.
- [ ] Verify authenticated diagnostics, rate limiting, logs, and queue-failure
      alerts without exposing credentials or source content.

### 9. Promote, monitor, and retain rollback

- [ ] Direct the production domain to Vercel only after API readiness and smoke
      tests pass.
- [ ] Enable uptime checks for the web page, `/v1/health`, and `/v1/ready`.
- [ ] Enable alerts for API errors, worker failures, Redis and PostgreSQL
      availability, disk usage, TLS expiry, and LLM fallback rates.
- [ ] Schedule encrypted database backups and complete an isolated restore
      drill.
- [ ] Retain the preceding immutable web, API, and worker artifacts for rollback.
- [ ] Record the deployed release, migration result, backup identifier, smoke
      test result, approver, and rollback artifact.

## Locally completed release preparation

- [x] Frontend and backend typecheck, lint, tests, and production builds pass.
- [x] Complete frontend and backend dependency audits pass.
- [x] Functional browser, cross-platform visual regression, and Lighthouse
      acceptance run in CI.
- [x] GitHub App and Notion OAuth state signing, tamper rejection, and expiry
      behavior have automated coverage.
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
