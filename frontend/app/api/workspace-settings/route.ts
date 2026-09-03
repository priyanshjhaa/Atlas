import { NextResponse } from "next/server";
import {
  forwardWorkspaceRequest,
  requireWorkspaceRole,
} from "@/lib/workspace-settings-proxy";

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
    name?: unknown;
  } | null;
  if (!body || typeof body.name !== "string") {
    return NextResponse.json(
      { message: "A workspace name is required." },
      { status: 400 },
    );
  }
  const access = await requireWorkspaceRole(body.workspaceId, ["owner", "admin"]);
  if (access.error) return access.error;
  const name = body.name.trim();
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json(
      { message: "Workspace names must contain between 2 and 80 characters." },
      { status: 400 },
    );
  }
  return forwardWorkspaceRequest(
    `/v1/workspaces/${access.workspaceId}`,
    access.workspaceId,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
}
