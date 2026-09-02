import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { getAtlasMe } from "@/lib/workspace-api";

async function forward(response: Response) {
  const body = await response.json().catch(() => ({
    message: "The explanation service returned an invalid response.",
  }));
  return NextResponse.json(body, { status: response.status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  const body = (await request.json()) as { workspaceId?: unknown };
  if (typeof body.workspaceId !== "string") {
    return NextResponse.json(
      { message: "A workspace identifier is required." },
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

  const { reportId } = await context.params;
  return forward(
    await fetchAtlasApi(
      `/v1/workspaces/${body.workspaceId}/impact-reports/${reportId}/explanation/retry`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "X-Atlas-Workspace-Id": body.workspaceId,
        },
      },
    ),
  );
}
