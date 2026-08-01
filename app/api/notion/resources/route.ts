import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    workspaceId?: string;
    resourceIds?: string[];
  };
  if (!body.workspaceId || !Array.isArray(body.resourceIds)) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }
  const response = await fetchAtlasApi(
    `/v1/workspaces/${body.workspaceId}/connectors/notion/resources`,
    {
      method: "PATCH",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Atlas-Workspace-Id": body.workspaceId,
      },
      body: JSON.stringify({ resourceIds: body.resourceIds }),
    },
  );
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
