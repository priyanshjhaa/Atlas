# CodeMap service fork

Atlas contains a one-time, owned adaptation of selected backend intelligence
services from the sibling CodeMap repository.

## Source

- Repository: `https://github.com/priyanshjhaa/codemap`
- Source commit: `fadd593f0fed2f0194cad21bd84003af4e42cbe4`
- Fork date: 2026-07-26

## Included concepts

- GitHub repository archive download
- eligible-file discovery and safety limits
- TypeScript/JavaScript symbol parsing and code chunking
- deterministic local and optional OpenAI embeddings
- static-import architecture inference
- vector-plus-lexical retrieval and citation metadata

## Explicitly excluded

- CodeMap web UI, branding, navigation, authentication, and onboarding
- Prisma schema and migrations
- OAuth repository credentials
- chat/session models and provider-specific chat generation
- CodeMap queue, workspace, repository, and audit implementations

## Atlas adaptations

- Drizzle and Atlas-owned migrations replace Prisma.
- Every persisted record is scoped by Atlas workspace and repository IDs.
- GitHub App installation tokens replace user OAuth repository tokens.
- BullMQ jobs use Atlas sync IDs, cancellation, retries, and audit events.
- Relationships include observed evidence, source revision, provenance, and
  numeric confidence.
- Temporary repository archives are deleted after every worker attempt.

This directory is now maintained as Atlas code. Future CodeMap changes are not
merged automatically.
