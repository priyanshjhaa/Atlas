import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { getAtlasMe } from "@/lib/workspace-api";

async function membership(workspaceId: string) {
  const me = await getAtlasMe();
  return me.workspaces.find((workspace) => workspace.id === workspaceId);
}

async function forward(response: Response) {
  const body = await response.json().catch(() => ({
    message: "The synchronization service returned an invalid response.",
  }));
  return NextResponse.json(body, { status: response.status });
}

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || !(await membership(workspaceId))) {
    return NextResponse.json(
      { message: "The workspace is not available." },
      { status: 403 },
    );
  }
  return forward(
    await fetchAtlasApi(`/v1/workspaces/${workspaceId}/sync-jobs`, {
      cache: "no-store",
      headers: { "X-Atlas-Workspace-Id": workspaceId },
    }),
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    workspaceId?: unknown;
    repositoryIds?: unknown;
  };
  if (typeof body.workspaceId !== "string") {
    return NextResponse.json(
      { message: "A workspace identifier is required." },
      { status: 400 },
    );
  }
  const access = await membership(body.workspaceId);
  if (!access || access.role === "viewer") {
    return NextResponse.json(
      { message: "Workspace member access is required." },
      { status: 403 },
    );
  }

  return forward(
    await fetchAtlasApi(`/v1/workspaces/${body.workspaceId}/sync-jobs`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key":
          request.headers.get("Idempotency-Key") ?? crypto.randomUUID(),
        "X-Atlas-Workspace-Id": body.workspaceId,
      },
      body: JSON.stringify({ repositoryIds: body.repositoryIds }),
    }),
  );
}
