export const repositorySyncQueueName = "atlas-repository-sync";
export const repositorySyncJobName = "synchronize-repository";
export const notionSyncQueueName = "atlas-notion-sync";
export const notionSyncJobName = "synchronize-notion";

export interface RepositorySyncJobData {
  syncJobId: string;
  workspaceId: string;
  repositoryId: string;
}

export interface NotionSyncJobData {
  notionSyncJobId: string;
  workspaceId: string;
  connectorId: string;
}

export type SyncJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
