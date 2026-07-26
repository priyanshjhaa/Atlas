export type AtlasWorkspaceRole = "owner" | "admin" | "member" | "viewer";

export interface AtlasApiUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface AtlasWorkspace {
  id: string;
  name: string;
  slug: string;
  role: AtlasWorkspaceRole;
  repositoryCount: number;
}

export interface AtlasMe {
  user: AtlasApiUser;
  session: { id: string };
  workspaces: AtlasWorkspace[];
}

export interface AtlasRepository {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string | null;
  isPrivate: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
}

export interface AtlasGitHubConnector {
  id: string;
  status: "pending" | "active" | "failed" | "revoked";
  installationId: string | null;
  configuration: {
    account?: string;
    accountType?: string;
    repositorySelection?: "all" | "selected";
  };
  createdAt: string;
  updatedAt: string;
}

export type AtlasSyncJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AtlasSyncJob {
  id: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  status: AtlasSyncJobStatus;
  attempt: number;
  progress: number;
  stage: string;
  result: {
    outcome?: "updated" | "no_change";
    revision?: string;
    filesIndexed?: number;
    chunksCreated?: number;
    symbolsExtracted?: number;
    relationshipsExtracted?: number;
    languages?: string[];
    embeddingProvider?: "local" | "openai";
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AtlasWorkspaceData {
  me: AtlasMe;
  activeWorkspace: AtlasWorkspace;
  repositories: AtlasRepository[];
}
