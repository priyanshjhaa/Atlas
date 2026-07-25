export const workspaceRoles = ["owner", "admin", "member", "viewer"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export interface AuthenticatedIdentity {
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

export interface WorkspaceAccess {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface AtlasRequest {
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthenticatedIdentity;
  workspace?: WorkspaceAccess;
}
