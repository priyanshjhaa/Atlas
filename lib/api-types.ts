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

export interface AtlasWorkspaceData {
  me: AtlasMe;
  activeWorkspace: AtlasWorkspace;
  repositories: AtlasRepository[];
}
