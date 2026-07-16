# Atlas

Atlas is an engineering-intelligence product for understanding the impact of software changes across repositories, architecture, history, and technical documentation.

This repository currently contains the frontend-first product prototype. It uses one coherent mock workspace to demonstrate the marketing experience, engineering overview, impact-analysis workflow, knowledge graph, architecture explorer, engineering search, connectors, synchronization activity, and workspace settings.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

The development server prints the local preview URL when it starts.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Product routes

- `/` — marketing experience
- `/app` — workspace overview
- `/app/impact/new` — planned-change and pull-request input
- `/app/impact/demo` — evidence-backed impact report
- `/app/graph` — engineering knowledge graph
- `/app/architecture` — system architecture
- `/app/search` — engineering search
- `/app/sources` — GitHub and Notion sources
- `/app/activity` — indexing activity
- `/app/settings` — workspace settings

Atlas is a new product. CodeMap remains independent; selected repository-intelligence services will be incorporated later as a one-time code fork.
