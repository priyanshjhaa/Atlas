# Atlas

Atlas is an engineering-intelligence product for understanding the impact of software changes across repositories, architecture, history, and technical documentation.

This repository currently contains the frontend-first product prototype. It uses one coherent mock workspace to demonstrate the marketing experience, engineering overview, impact-analysis workflow, knowledge graph, architecture explorer, engineering search, connectors, synchronization activity, and workspace settings. The web application follows the standard Next.js App Router structure and build lifecycle.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

The development server prints the local preview URL when it starts.

## Deployment

The web application is prepared for a native Next.js deployment on Vercel. No custom adapter or platform-specific build command is required:

- Build command: `npm run build`
- Start command: `npm run start`
- Node.js: 22 or newer

Configure the Better Auth, GitHub OAuth, database, backend URL, and GitHub App
values in the deployment environment. The NestJS API is deployed separately to
Railway.

## Authentication

Atlas uses Better Auth with GitHub as its only sign-in provider. Users and
sessions are persisted in PostgreSQL, and protected backend requests use
short-lived Better Auth JWTs that are also checked against the live session.

1. Create a GitHub OAuth app with this callback URL:

   ```text
   http://localhost:3000/api/auth/callback/github
   ```

2. Copy `.env.example` to `.env.local` and configure `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_URL`, and a high-entropy `BETTER_AUTH_SECRET` of at least 32 characters.

3. Keep repository ingestion separate from login. GitHub sign-in requests
   profile and email access only; a separate GitHub App provides explicit
   repository access from the Sources page.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Product routes

- `/` — marketing experience
- `/sign-in` — GitHub sign-in
- `/app` — protected workspace overview
- `/app/impact/new` — planned-change and pull-request input
- `/app/impact/demo` — evidence-backed impact report
- `/app/graph` — engineering knowledge graph
- `/app/architecture` — system architecture
- `/app/search` — engineering search
- `/app/sources` — GitHub and Notion sources
- `/app/activity` — live repository synchronization jobs and progress
- `/app/settings` — workspace settings

Atlas is a new product. CodeMap remains independent; selected repository-intelligence services will be incorporated later as a one-time code fork.
