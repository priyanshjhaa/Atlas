import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { getAtlasMe } from "@/lib/workspace-api";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
  } | null;
  if (!body || typeof body.workspaceId !== "string") {
    return NextResponse.json(
      { message: "A workspace identifier is required." },
      { status: 400 },
    );
  }

  const me = await getAtlasMe();
  const membership = me.workspaces.find(
    (workspace) => workspace.id === body.workspaceId,
  );
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { message: "Workspace administrator access is required." },
      { status: 403 },
    );
  }

  const response = await fetchAtlasApi(
    `/v1/workspaces/${body.workspaceId}/onboarding/complete`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "X-Atlas-Workspace-Id": body.workspaceId },
    },
  );
  const responseBody = await response.json().catch(() => ({
    message: "Atlas could not complete workspace setup.",
  }));
  return NextResponse.json(responseBody, { status: response.status });
}
