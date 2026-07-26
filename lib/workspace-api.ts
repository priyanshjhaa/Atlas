import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import type {
  AtlasMe,
  AtlasGitHubConnector,
  AtlasRepository,
  AtlasWorkspaceData,
} from "./api-types";
import { fetchAtlasApi } from "./backend-client";

async function readApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Atlas API request failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

export const getAtlasMe = cache(async (): Promise<AtlasMe> => {
  const response = await fetchAtlasApi("/v1/me", { cache: "no-store" });
  return readApiResponse<AtlasMe>(response);
});

export const getAtlasWorkspaceData = cache(
  async (): Promise<AtlasWorkspaceData> => {
    const me = await getAtlasMe();
    const selectedWorkspaceId = (await cookies()).get("atlas-workspace")?.value;
    const activeWorkspace =
      me.workspaces.find(
        (workspace) => workspace.id === selectedWorkspaceId,
      ) ?? me.workspaces[0];

    if (!activeWorkspace) {
      throw new Error("The authenticated Atlas user has no workspace.");
    }

    const response = await fetchAtlasApi(
      `/v1/workspaces/${activeWorkspace.id}/repositories`,
      {
        cache: "no-store",
        headers: {
          "X-Atlas-Workspace-Id": activeWorkspace.id,
        },
      },
    );

    return {
      me,
      activeWorkspace,
      repositories: await readApiResponse<AtlasRepository[]>(response),
    };
  },
);

export async function getAtlasGitHubConnectors(
  workspaceId: string,
): Promise<AtlasGitHubConnector[]> {
  const response = await fetchAtlasApi(
    `/v1/workspaces/${workspaceId}/connectors/github`,
    {
      cache: "no-store",
      headers: {
        "X-Atlas-Workspace-Id": workspaceId,
      },
    },
  );
  return readApiResponse<AtlasGitHubConnector[]>(response);
}
