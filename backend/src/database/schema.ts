import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);
export const connectorProvider = pgEnum("connector_provider", ["github"]);
export const connectorStatus = pgEnum("connector_status", [
  "pending",
  "active",
  "revoked",
  "failed",
]);
export const syncJobStatus = pgEnum("sync_job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

// Better Auth-compatible identity tables. The adapter is connected in Milestone 3.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("accounts_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspaces_slug_unique").on(table.slug),
    index("workspaces_created_by_user_id_idx").on(table.createdByUserId),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").default("member").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_members_workspace_id_idx").on(table.workspaceId),
    index("workspace_members_user_id_idx").on(table.userId),
  ],
);

export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: connectorProvider("provider").notNull(),
    status: connectorStatus("status").default("pending").notNull(),
    providerInstallationId: text("provider_installation_id"),
    encryptedCredentials: text("encrypted_credentials"),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index("connectors_workspace_id_idx").on(table.workspaceId),
    uniqueIndex("connectors_provider_installation_unique").on(
      table.provider,
      table.providerInstallationId,
    ),
  ],
);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectorId: uuid("connector_id").references(() => connectors.id, {
      onDelete: "set null",
    }),
    providerRepositoryId: text("provider_repository_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch"),
    isPrivate: boolean("is_private").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncedRevision: text("last_synced_revision"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("repositories_workspace_provider_repo_unique").on(
      table.workspaceId,
      table.providerRepositoryId,
    ),
    index("repositories_workspace_id_idx").on(table.workspaceId),
    index("repositories_connector_id_idx").on(table.connectorId),
  ],
);

export const codeFiles = pgTable(
  "code_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    language: text("language").notNull(),
    checksum: text("checksum").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sourceRevision: text("source_revision").notNull(),
    parsedAt: timestamp("parsed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("code_files_repository_path_unique").on(
      table.repositoryId,
      table.path,
    ),
    index("code_files_workspace_id_idx").on(table.workspaceId),
    index("code_files_repository_id_idx").on(table.repositoryId),
  ],
);

export const codeSymbols = pgTable(
  "code_symbols",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    exported: boolean("exported").default(false).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
  },
  (table) => [
    uniqueIndex("code_symbols_repository_stable_key_unique").on(
      table.repositoryId,
      table.stableKey,
    ),
    index("code_symbols_workspace_id_idx").on(table.workspaceId),
    index("code_symbols_repository_id_idx").on(table.repositoryId),
    index("code_symbols_file_id_idx").on(table.fileId),
  ],
);

export const codeChunks = pgTable(
  "code_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    summary: text("summary"),
    language: text("language").notNull(),
    tokenCount: integer("token_count").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    uniqueIndex("code_chunks_file_chunk_unique").on(
      table.fileId,
      table.chunkIndex,
    ),
    index("code_chunks_workspace_id_idx").on(table.workspaceId),
    index("code_chunks_repository_id_idx").on(table.repositoryId),
    index("code_chunks_file_id_idx").on(table.fileId),
    index("code_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const codeRelationships = pgTable(
  "code_relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceFileId: uuid("source_file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    targetFileId: uuid("target_file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    stableKey: text("stable_key").notNull(),
    provenance: text("provenance").notNull(),
    confidence: real("confidence").notNull(),
    sourceRevision: text("source_revision").notNull(),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("code_relationships_repository_stable_key_unique").on(
      table.repositoryId,
      table.stableKey,
    ),
    index("code_relationships_workspace_id_idx").on(table.workspaceId),
    index("code_relationships_repository_id_idx").on(table.repositoryId),
    index("code_relationships_source_file_id_idx").on(table.sourceFileId),
    index("code_relationships_target_file_id_idx").on(table.targetFileId),
  ],
);

export const architectureSnapshots = pgTable(
  "architecture_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceRevision: text("source_revision").notNull(),
    summary: text("summary").notNull(),
    moduleMap: jsonb("module_map")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    diagram: text("diagram").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("architecture_snapshots_repository_revision_unique").on(
      table.repositoryId,
      table.sourceRevision,
    ),
    index("architecture_snapshots_workspace_id_idx").on(table.workspaceId),
    index("architecture_snapshots_repository_id_idx").on(table.repositoryId),
  ],
);

export const impactReports = pgTable(
  "impact_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sourceRevision: text("source_revision").notNull(),
    input: jsonb("input")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    result: jsonb("result")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    explanation: jsonb("explanation").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    index("impact_reports_workspace_id_idx").on(table.workspaceId),
    index("impact_reports_repository_id_idx").on(table.repositoryId),
    index("impact_reports_requested_by_user_id_idx").on(
      table.requestedByUserId,
    ),
    index("impact_reports_created_at_idx").on(table.createdAt),
  ],
);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: syncJobStatus("status").default("queued").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    attempt: integer("attempt").default(0).notNull(),
    progress: integer("progress").default(0).notNull(),
    stage: text("stage").default("queued").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sync_jobs_workspace_idempotency_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("sync_jobs_workspace_id_idx").on(table.workspaceId),
    index("sync_jobs_repository_id_idx").on(table.repositoryId),
    index("sync_jobs_status_idx").on(table.status),
    uniqueIndex("sync_jobs_repository_active_unique")
      .on(table.workspaceId, table.repositoryId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_events_workspace_id_idx").on(table.workspaceId),
    index("audit_events_actor_user_id_idx").on(table.actorUserId),
    index("audit_events_created_at_idx").on(table.createdAt),
  ],
);

export const githubWebhookDeliveries = pgTable("github_webhook_deliveries", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
