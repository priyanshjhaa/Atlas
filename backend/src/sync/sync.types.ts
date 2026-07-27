export const repositorySyncQueueName = "atlas-repository-sync";
export const repositorySyncJobName = "synchronize-repository";

export interface RepositorySyncJobData {
  syncJobId: string;
  workspaceId: string;
  repositoryId: string;
}

export type SyncJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
