import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { getAtlasMe } from "@/lib/workspace-api";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    workspaceId?: unknown;
    repositoryId?: unknown;
    query?: unknown;
  };
  if (
    typeof body.workspaceId !== "string" ||
    typeof body.repositoryId !== "string" ||
    typeof body.query !== "string" ||
    body.query.trim().length < 2 ||
    body.query.length > 500
  ) {
    return NextResponse.json(
      {
        message:
          "Workspace, repository, and a search query between 2 and 500 characters are required.",
      },
      { status: 400 },
    );
  }

  const me = await getAtlasMe();
  if (!me.workspaces.some((workspace) => workspace.id === body.workspaceId)) {
    return NextResponse.json(
      { message: "Workspace member access is required." },
      { status: 403 },
    );
  }

  const response = await fetchAtlasApi(
    `/v1/workspaces/${body.workspaceId}/repositories/${body.repositoryId}/intelligence/search`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Atlas-Workspace-Id": body.workspaceId,
      },
      body: JSON.stringify({ query: body.query.trim() }),
    },
  );
  const responseBody = await response.json().catch(() => ({
    message: "The intelligence search service returned an invalid response.",
  }));
  return NextResponse.json(responseBody, { status: response.status });
}
