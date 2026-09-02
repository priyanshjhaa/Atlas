import "server-only";

import { NextResponse } from "next/server";
import { fetchAtlasApi } from "./backend-client";
import { getAtlasMe } from "./workspace-api";
import type { AtlasWorkspaceRole } from "./api-types";

export async function requireWorkspaceRole(
  workspaceId: unknown,
  roles: AtlasWorkspaceRole[],
) {
  if (typeof workspaceId !== "string" || !workspaceId) {
    return {
      error: NextResponse.json(
        { message: "A workspace identifier is required." },
        { status: 400 },
      ),
    };
  }
  const me = await getAtlasMe();
  const membership = me.workspaces.find((item) => item.id === workspaceId);
  if (!membership || !roles.includes(membership.role)) {
    return {
      error: NextResponse.json(
        { message: "You do not have permission to manage this workspace." },
        { status: 403 },
      ),
    };
  }
  return { workspaceId, membership };
}

export async function forwardWorkspaceRequest(
  path: string,
  workspaceId: string,
  init: RequestInit,
) {
  const response = await fetchAtlasApi(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
      "X-Atlas-Workspace-Id": workspaceId,
    },
  });
  if (response.status === 204) return new NextResponse(null, { status: 204 });
  const body = await response.json().catch(() => ({
    message: "Atlas returned an invalid workspace response.",
  }));
  return NextResponse.json(body, { status: response.status });
}
