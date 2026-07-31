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
- Atlas creates an in-memory TypeScript program during ingestion and records
  compiler-resolved import targets and imported symbol identities.
- Solution-style `tsconfig` project references are traversed with each
  referenced project's compiler options and source scope.
- Workspace manifests contribute stable package names, entry points, exports,
  dependencies, and compiler mappings without relying on `node_modules`
  symlinks inside downloaded repository archives.
- Package identities and dependency links are persisted with source revision,
  manifest provenance, confidence, and strict workspace scoping.
- Symbol identities do not depend on line numbers. Public API exports and named
  import bindings form revision-stamped symbol links across repositories when
  both the package and symbol targets resolve uniquely.
- Direct and namespace call usages are stored independently from import edges
  and linked back to the containing source symbol when one is available.
- Temporary repository archives are deleted after every worker attempt.

This directory is now maintained as Atlas code. Future CodeMap changes are not
merged automatically.
