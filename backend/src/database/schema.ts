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

export interface GitHubActorRecord {
  providerUserId: string | null;
  login: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  kind: "person" | "bot" | "unknown";
}

export interface NotionEditorRecord {
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  kind: "person" | "bot" | "unknown";
}

export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);
export const connectorProvider = pgEnum("connector_provider", [
  "github",
  "notion",
]);
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
export const graphRelationshipClassification = pgEnum(
  "graph_relationship_classification",
  ["observed", "historical", "inferred"],
);
export const impactFeedbackRating = pgEnum("impact_feedback_rating", [
  "useful",
  "not_useful",
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
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
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

export const notionResources = pgTable(
  "notion_resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connectors.id, { onDelete: "cascade" }),
    providerResourceId: text("provider_resource_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    parentId: text("parent_id"),
    isSelected: boolean("is_selected").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
    lastEditor: jsonb("last_editor").$type<NotionEditorRecord>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notion_resources_connector_provider_id_unique").on(
      table.connectorId,
      table.providerResourceId,
    ),
    index("notion_resources_workspace_id_idx").on(table.workspaceId),
    index("notion_resources_connector_id_idx").on(table.connectorId),
    index("notion_resources_selected_active_idx").on(
      table.connectorId,
      table.isSelected,
      table.isActive,
    ),
  ],
);

export const notionDocuments = pgTable(
  "notion_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connectors.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => notionResources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    sourceRevision: text("source_revision").notNull(),
    lastEditor: jsonb("last_editor").$type<NotionEditorRecord>(),
    citation: jsonb("citation")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    truncated: boolean("truncated").default(false).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notion_documents_resource_id_unique").on(table.resourceId),
    index("notion_documents_workspace_id_idx").on(table.workspaceId),
    index("notion_documents_connector_id_idx").on(table.connectorId),
    index("notion_documents_content_hash_idx").on(table.contentHash),
  ],
);

export const notionDocumentVersions = pgTable(
  "notion_document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => notionDocuments.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    sourceRevision: text("source_revision").notNull(),
    editor: jsonb("editor").$type<NotionEditorRecord>(),
    content: text("content").notNull(),
    citation: jsonb("citation")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    truncated: boolean("truncated").default(false).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("notion_document_versions_document_revision_unique").on(
      table.documentId,
      table.sourceRevision,
    ),
    index("notion_document_versions_workspace_id_idx").on(table.workspaceId),
    index("notion_document_versions_document_id_idx").on(table.documentId),
    index("notion_document_versions_captured_at_idx").on(table.capturedAt),
  ],
);

export const workspaceNotionCursors = pgTable(
  "workspace_notion_cursors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    acknowledgedThrough: timestamp("acknowledged_through", {
      withTimezone: true,
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_notion_cursors_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_notion_cursors_workspace_id_idx").on(table.workspaceId),
    index("workspace_notion_cursors_user_id_idx").on(table.userId),
  ],
);

export const notionContextBriefings = pgTable(
  "notion_context_briefings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rangeStart: timestamp("range_start", { withTimezone: true }).notNull(),
    rangeEnd: timestamp("range_end", { withTimezone: true }).notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    generationStatus: text("generation_status").notNull(),
    result: jsonb("result")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notion_context_briefings_range_unique").on(
      table.workspaceId,
      table.userId,
      table.rangeStart,
      table.rangeEnd,
      table.evidenceHash,
    ),
    index("notion_context_briefings_workspace_id_idx").on(table.workspaceId),
    index("notion_context_briefings_user_id_idx").on(table.userId),
    index("notion_context_briefings_range_end_idx").on(table.rangeEnd),
  ],
);

export const notionDocumentReviews = pgTable(
  "notion_document_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    documentId: uuid("document_id").references(() => notionDocuments.id, {
      onDelete: "set null",
    }),
    currentVersionId: uuid("current_version_id").references(
      () => notionDocumentVersions.id,
      { onDelete: "set null" },
    ),
    previousVersionId: uuid("previous_version_id").references(
      () => notionDocumentVersions.id,
      { onDelete: "set null" },
    ),
    documentTitle: text("document_title").notNull(),
    documentUrl: text("document_url"),
    currentRevision: text("current_revision").notNull(),
    previousRevision: text("previous_revision").notNull(),
    currentCapturedAt: timestamp("current_captured_at", {
      withTimezone: true,
    }).notNull(),
    previousCapturedAt: timestamp("previous_captured_at", {
      withTimezone: true,
    }).notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    generationStatus: text("generation_status").notNull(),
    result: jsonb("result")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notion_document_reviews_comparison_unique").on(
      table.workspaceId,
      table.documentId,
      table.currentRevision,
      table.previousRevision,
      table.evidenceHash,
    ),
    index("notion_document_reviews_workspace_id_idx").on(table.workspaceId),
    index("notion_document_reviews_document_id_idx").on(table.documentId),
    index("notion_document_reviews_requested_by_idx").on(
      table.requestedByUserId,
    ),
    index("notion_document_reviews_created_at_idx").on(table.createdAt),
  ],
);

export const notionDocumentChunks = pgTable(
  "notion_document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connectors.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => notionResources.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => notionDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),
    sourceRevision: text("source_revision").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notion_document_chunks_document_chunk_unique").on(
      table.documentId,
      table.chunkIndex,
    ),
    index("notion_document_chunks_workspace_id_idx").on(table.workspaceId),
    index("notion_document_chunks_connector_id_idx").on(table.connectorId),
    index("notion_document_chunks_resource_id_idx").on(table.resourceId),
    index("notion_document_chunks_document_id_idx").on(table.documentId),
    index("notion_document_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const notionSyncJobs = pgTable(
  "notion_sync_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connectors.id, { onDelete: "cascade" }),
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
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notion_sync_jobs_workspace_idempotency_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    uniqueIndex("notion_sync_jobs_connector_active_unique")
      .on(table.workspaceId, table.connectorId)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("notion_sync_jobs_workspace_id_idx").on(table.workspaceId),
    index("notion_sync_jobs_connector_id_idx").on(table.connectorId),
    index("notion_sync_jobs_status_idx").on(table.status),
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
    packageId: uuid("package_id").references(() => codePackages.id, {
      onDelete: "set null",
    }),
    stableKey: text("stable_key").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    qualifiedName: text("qualified_name"),
    lineStart: integer("line_start").notNull(),
    lineEnd: integer("line_end").notNull(),
    exported: boolean("exported").default(false).notNull(),
    publicApi: boolean("public_api").default(false).notNull(),
    exportNames: jsonb("export_names").$type<string[]>().default([]).notNull(),
    apiSpecifiers: jsonb("api_specifiers").$type<string[]>().default([]).notNull(),
    sourceRevision: text("source_revision"),
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
    index("code_symbols_package_id_idx").on(table.packageId),
    index("code_symbols_workspace_public_api_idx").on(
      table.workspaceId,
      table.publicApi,
    ),
  ],
);

export const codeImports = pgTable(
  "code_imports",
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
    specifier: text("specifier").notNull(),
    line: integer("line").notNull(),
    bindings: jsonb("bindings")
      .$type<
        Array<{
          localName: string;
          importedName: string;
          kind: "default" | "named" | "namespace";
          typeOnly: boolean;
        }>
      >()
      .default([])
      .notNull(),
    sourceRevision: text("source_revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("code_imports_repository_stable_key_unique").on(
      table.repositoryId,
      table.stableKey,
    ),
    index("code_imports_workspace_id_idx").on(table.workspaceId),
    index("code_imports_repository_id_idx").on(table.repositoryId),
    index("code_imports_file_id_idx").on(table.fileId),
    index("code_imports_workspace_specifier_idx").on(
      table.workspaceId,
      table.specifier,
    ),
  ],
);

export const codeCalls = pgTable(
  "code_calls",
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
    sourceSymbolId: uuid("source_symbol_id").references(() => codeSymbols.id, {
      onDelete: "set null",
    }),
    stableKey: text("stable_key").notNull(),
    localName: text("local_name").notNull(),
    memberName: text("member_name"),
    line: integer("line").notNull(),
    sourceRevision: text("source_revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("code_calls_repository_stable_key_unique").on(
      table.repositoryId,
      table.stableKey,
    ),
    index("code_calls_workspace_id_idx").on(table.workspaceId),
    index("code_calls_repository_id_idx").on(table.repositoryId),
    index("code_calls_file_id_idx").on(table.fileId),
    index("code_calls_source_symbol_id_idx").on(table.sourceSymbolId),
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

export const codePackages = pgTable(
  "code_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    name: text("name").notNull(),
    version: text("version"),
    rootPath: text("root_path").notNull(),
    manifestPath: text("manifest_path").notNull(),
    entryPoints: jsonb("entry_points").$type<string[]>().default([]).notNull(),
    exportMappings: jsonb("export_mappings")
      .$type<Record<string, string[]>>()
      .default({})
      .notNull(),
    dependencies: jsonb("dependencies")
      .$type<
        Array<{
          name: string;
          range: string;
          kind: "runtime" | "development" | "peer" | "optional";
        }>
      >()
      .default([])
      .notNull(),
    sourceRevision: text("source_revision").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("code_packages_repository_stable_key_unique").on(
      table.repositoryId,
      table.stableKey,
    ),
    index("code_packages_workspace_name_idx").on(
      table.workspaceId,
      table.name,
    ),
    index("code_packages_repository_id_idx").on(table.repositoryId),
  ],
);

export const packageRelationships = pgTable(
  "package_relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceRepositoryId: uuid("source_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourcePackageId: uuid("source_package_id")
      .notNull()
      .references(() => codePackages.id, { onDelete: "cascade" }),
    targetRepositoryId: uuid("target_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    targetPackageId: uuid("target_package_id")
      .notNull()
      .references(() => codePackages.id, { onDelete: "cascade" }),
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
    uniqueIndex("package_relationships_workspace_stable_key_unique").on(
      table.workspaceId,
      table.stableKey,
    ),
    index("package_relationships_workspace_id_idx").on(table.workspaceId),
    index("package_relationships_source_repository_id_idx").on(
      table.sourceRepositoryId,
    ),
    index("package_relationships_target_repository_id_idx").on(
      table.targetRepositoryId,
    ),
    index("package_relationships_source_package_id_idx").on(
      table.sourcePackageId,
    ),
    index("package_relationships_target_package_id_idx").on(
      table.targetPackageId,
    ),
  ],
);

export const symbolRelationships = pgTable(
  "symbol_relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceRepositoryId: uuid("source_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceFileId: uuid("source_file_id")
      .notNull()
      .references(() => codeFiles.id, { onDelete: "cascade" }),
    sourceSymbolId: uuid("source_symbol_id").references(() => codeSymbols.id, {
      onDelete: "set null",
    }),
    targetRepositoryId: uuid("target_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    targetSymbolId: uuid("target_symbol_id")
      .notNull()
      .references(() => codeSymbols.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    stableKey: text("stable_key").notNull(),
    provenance: text("provenance").notNull(),
    confidence: real("confidence").notNull(),
    sourceRevision: text("source_revision").notNull(),
    targetRevision: text("target_revision").notNull(),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("symbol_relationships_workspace_stable_key_unique").on(
      table.workspaceId,
      table.stableKey,
    ),
    index("symbol_relationships_workspace_id_idx").on(table.workspaceId),
    index("symbol_relationships_source_repository_id_idx").on(
      table.sourceRepositoryId,
    ),
    index("symbol_relationships_target_repository_id_idx").on(
      table.targetRepositoryId,
    ),
    index("symbol_relationships_source_file_id_idx").on(table.sourceFileId),
    index("symbol_relationships_source_symbol_id_idx").on(
      table.sourceSymbolId,
    ),
    index("symbol_relationships_target_symbol_id_idx").on(
      table.targetSymbolId,
    ),
  ],
);

export const relationshipObservations = pgTable(
  "relationship_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    observedByRepositoryId: uuid("observed_by_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    observedRevision: text("observed_revision").notNull(),
    sourceRepositoryId: uuid("source_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceEntityKind: text("source_entity_kind").notNull(),
    sourceEntityKey: text("source_entity_key").notNull(),
    targetRepositoryId: uuid("target_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    targetEntityKind: text("target_entity_kind").notNull(),
    targetEntityKey: text("target_entity_key").notNull(),
    kind: text("kind").notNull(),
    stableKey: text("stable_key").notNull(),
    provenance: text("provenance").notNull(),
    confidence: real("confidence").notNull(),
    sourceRevision: text("source_revision").notNull(),
    targetRevision: text("target_revision").notNull(),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("relationship_observations_revision_stable_key_unique").on(
      table.workspaceId,
      table.observedByRepositoryId,
      table.observedRevision,
      table.stableKey,
    ),
    index("relationship_observations_workspace_id_idx").on(table.workspaceId),
    index("relationship_observations_observer_revision_idx").on(
      table.observedByRepositoryId,
      table.observedRevision,
    ),
    index("relationship_observations_source_repository_id_idx").on(
      table.sourceRepositoryId,
    ),
    index("relationship_observations_target_repository_id_idx").on(
      table.targetRepositoryId,
    ),
    index("relationship_observations_stable_key_idx").on(table.stableKey),
  ],
);

export const graphEntities = pgTable(
  "graph_entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    stableKey: text("stable_key").notNull(),
    name: text("name").notNull(),
    path: text("path"),
    sourceRevision: text("source_revision").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("graph_entities_repository_type_stable_key_unique").on(
      table.repositoryId,
      table.entityType,
      table.stableKey,
    ),
    index("graph_entities_workspace_id_idx").on(table.workspaceId),
    index("graph_entities_repository_id_idx").on(table.repositoryId),
    index("graph_entities_workspace_type_current_idx").on(
      table.workspaceId,
      table.entityType,
      table.isCurrent,
    ),
  ],
);

export const graphRelationships = pgTable(
  "graph_relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceRepositoryId: uuid("source_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceEntityId: uuid("source_entity_id")
      .notNull()
      .references(() => graphEntities.id, { onDelete: "cascade" }),
    targetRepositoryId: uuid("target_repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    targetEntityId: uuid("target_entity_id")
      .notNull()
      .references(() => graphEntities.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    stableKey: text("stable_key").notNull(),
    classification: graphRelationshipClassification("classification")
      .notNull(),
    provenance: text("provenance").notNull(),
    confidence: real("confidence").notNull(),
    sourceRevision: text("source_revision").notNull(),
    targetRevision: text("target_revision").notNull(),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("graph_relationships_workspace_stable_key_unique").on(
      table.workspaceId,
      table.stableKey,
    ),
    index("graph_relationships_workspace_id_idx").on(table.workspaceId),
    index("graph_relationships_source_repository_id_idx").on(
      table.sourceRepositoryId,
    ),
    index("graph_relationships_target_repository_id_idx").on(
      table.targetRepositoryId,
    ),
    index("graph_relationships_source_entity_id_idx").on(table.sourceEntityId),
    index("graph_relationships_target_entity_id_idx").on(table.targetEntityId),
    index("graph_relationships_workspace_classification_current_idx").on(
      table.workspaceId,
      table.classification,
      table.isCurrent,
    ),
  ],
);

export const repositoryCommits = pgTable(
  "repository_commits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    message: text("message").notNull(),
    authorName: text("author_name"),
    authorLogin: text("author_login"),
    authoredAt: timestamp("authored_at", { withTimezone: true }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    parentShas: jsonb("parent_shas").$type<string[]>().default([]).notNull(),
    htmlUrl: text("html_url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("repository_commits_repository_sha_unique").on(
      table.repositoryId,
      table.sha,
    ),
    index("repository_commits_workspace_id_idx").on(table.workspaceId),
    index("repository_commits_repository_id_idx").on(table.repositoryId),
    index("repository_commits_committed_at_idx").on(table.committedAt),
  ],
);

export const repositoryPullRequests = pgTable(
  "repository_pull_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    providerPullRequestId: text("provider_pull_request_id").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    state: text("state").notNull(),
    isDraft: boolean("is_draft").default(false).notNull(),
    author: jsonb("author").$type<GitHubActorRecord>(),
    mergedBy: jsonb("merged_by").$type<GitHubActorRecord>(),
    baseRevision: text("base_revision").notNull(),
    headRevision: text("head_revision").notNull(),
    reviewsTruncated: boolean("reviews_truncated").default(false).notNull(),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true })
      .notNull(),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true })
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("repository_pull_requests_repository_number_unique").on(
      table.repositoryId,
      table.number,
    ),
    uniqueIndex("repository_pull_requests_repository_provider_id_unique").on(
      table.repositoryId,
      table.providerPullRequestId,
    ),
    index("repository_pull_requests_workspace_id_idx").on(table.workspaceId),
    index("repository_pull_requests_repository_id_idx").on(table.repositoryId),
    index("repository_pull_requests_updated_at_idx").on(
      table.repositoryId,
      table.providerUpdatedAt,
    ),
  ],
);

export const repositoryPullRequestReviews = pgTable(
  "repository_pull_request_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => repositoryPullRequests.id, { onDelete: "cascade" }),
    providerReviewId: text("provider_review_id").notNull(),
    reviewer: jsonb("reviewer").$type<GitHubActorRecord>(),
    state: text("state").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    url: text("url").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("repository_pull_request_reviews_pr_provider_id_unique").on(
      table.pullRequestId,
      table.providerReviewId,
    ),
    index("repository_pull_request_reviews_workspace_id_idx").on(
      table.workspaceId,
    ),
    index("repository_pull_request_reviews_repository_id_idx").on(
      table.repositoryId,
    ),
    index("repository_pull_request_reviews_pull_request_id_idx").on(
      table.pullRequestId,
    ),
  ],
);

export const repositoryHistoryRanges = pgTable(
  "repository_history_ranges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    baseRevision: text("base_revision"),
    headRevision: text("head_revision").notNull(),
    status: text("status").notNull(),
    aheadBy: integer("ahead_by").notNull(),
    behindBy: integer("behind_by").notNull(),
    totalCommits: integer("total_commits").notNull(),
    commitsCaptured: integer("commits_captured").notNull(),
    filesCaptured: integer("files_captured").notNull(),
    commitsTruncated: boolean("commits_truncated").default(false).notNull(),
    filesTruncated: boolean("files_truncated").default(false).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("repository_history_ranges_repository_stable_key_unique").on(
      table.repositoryId,
      table.stableKey,
    ),
    index("repository_history_ranges_workspace_id_idx").on(table.workspaceId),
    index("repository_history_ranges_repository_id_idx").on(
      table.repositoryId,
    ),
    index("repository_history_ranges_captured_at_idx").on(table.capturedAt),
  ],
);

export const repositoryFileChanges = pgTable(
  "repository_file_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    historyRangeId: uuid("history_range_id")
      .notNull()
      .references(() => repositoryHistoryRanges.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    previousPath: text("previous_path"),
    status: text("status").notNull(),
    additions: integer("additions").notNull(),
    deletions: integer("deletions").notNull(),
    changes: integer("changes").notNull(),
  },
  (table) => [
    uniqueIndex("repository_file_changes_range_path_unique").on(
      table.historyRangeId,
      table.path,
    ),
    index("repository_file_changes_workspace_id_idx").on(table.workspaceId),
    index("repository_file_changes_repository_id_idx").on(table.repositoryId),
    index("repository_file_changes_history_range_id_idx").on(
      table.historyRangeId,
    ),
    index("repository_file_changes_path_idx").on(table.path),
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

export const impactReportFeedback = pgTable(
  "impact_report_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => impactReports.id, { onDelete: "cascade" }),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: impactFeedbackRating("rating").notNull(),
    confirmedFindingIds: jsonb("confirmed_finding_ids")
      .$type<string[]>()
      .default([])
      .notNull(),
    missedImpact: text("missed_impact"),
    comment: text("comment"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("impact_report_feedback_report_user_unique").on(
      table.reportId,
      table.submittedByUserId,
    ),
    index("impact_report_feedback_workspace_id_idx").on(table.workspaceId),
    index("impact_report_feedback_report_id_idx").on(table.reportId),
    index("impact_report_feedback_rating_idx").on(table.rating),
    index("impact_report_feedback_created_at_idx").on(table.createdAt),
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
