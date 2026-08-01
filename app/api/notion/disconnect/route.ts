import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";

export async function POST(request: Request) {
  const body = (await request.json()) as { workspaceId?: string };
  if (!body.workspaceId) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }
  const response = await fetchAtlasApi(
    `/v1/workspaces/${body.workspaceId}/connectors/notion`,
    {
      method: "DELETE",
      cache: "no-store",
      headers: { "X-Atlas-Workspace-Id": body.workspaceId },
    },
  );
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}
