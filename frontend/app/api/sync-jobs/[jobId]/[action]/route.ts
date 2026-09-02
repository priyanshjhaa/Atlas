import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { getAtlasMe } from "@/lib/workspace-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string; action: string }> },
) {
  const { jobId, action } = await context.params;
  const body = (await request.json()) as { workspaceId?: unknown };
  if (
    typeof body.workspaceId !== "string" ||
    !["cancel", "retry"].includes(action)
  ) {
    return NextResponse.json(
      { message: "Invalid synchronization action." },
      { status: 400 },
    );
  }

  const me = await getAtlasMe();
  const access = me.workspaces.find(
    (workspace) => workspace.id === body.workspaceId,
  );
  if (!access || access.role === "viewer") {
    return NextResponse.json(
      { message: "Workspace member access is required." },
      { status: 403 },
    );
  }

  const response = await fetchAtlasApi(
    `/v1/workspaces/${body.workspaceId}/sync-jobs/${encodeURIComponent(jobId)}/${action}`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "X-Atlas-Workspace-Id": body.workspaceId },
    },
  );
  const responseBody = await response.json().catch(() => ({
    message: "The synchronization service returned an invalid response.",
  }));
  return NextResponse.json(responseBody, { status: response.status });
}
