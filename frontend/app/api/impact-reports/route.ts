import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { getAtlasMe } from "@/lib/workspace-api";

async function forward(response: Response) {
  const body = await response.json().catch(() => ({
    message: "The impact-analysis service returned an invalid response.",
  }));
  return NextResponse.json(body, { status: response.status });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    workspaceId?: unknown;
    repositoryId?: unknown;
    mode?: unknown;
    description?: unknown;
    pullRequestNumber?: unknown;
    scope?: unknown;
    anchors?: unknown;
  };
  if (
    typeof body.workspaceId !== "string" ||
    typeof body.repositoryId !== "string"
  ) {
    return NextResponse.json(
      { message: "Workspace and repository identifiers are required." },
      { status: 400 },
    );
  }
  const me = await getAtlasMe();
  const membership = me.workspaces.find(
    (workspace) => workspace.id === body.workspaceId,
  );
  if (!membership || membership.role === "viewer") {
    return NextResponse.json(
      { message: "Workspace member access is required." },
      { status: 403 },
    );
  }

  return forward(
    await fetchAtlasApi(
      `/v1/workspaces/${body.workspaceId}/impact-reports`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Atlas-Workspace-Id": body.workspaceId,
        },
        body: JSON.stringify({
          repositoryId: body.repositoryId,
          mode: body.mode,
          description: body.description,
          pullRequestNumber: body.pullRequestNumber,
          scope: body.scope,
          anchors: body.anchors,
        }),
      },
    ),
  );
}
