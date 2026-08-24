import { NextResponse } from "next/server";
import type { AtlasWorkspaceRole } from "@/lib/api-types";
import {
  forwardWorkspaceRequest,
  requireWorkspaceRole,
} from "@/lib/workspace-settings-proxy";

const assignableRoles: AtlasWorkspaceRole[] = ["admin", "member", "viewer"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
    role?: unknown;
  } | null;
  if (
    !body ||
    typeof body.role !== "string" ||
    !assignableRoles.includes(body.role as AtlasWorkspaceRole)
  ) {
    return NextResponse.json({ message: "Select a valid role." }, { status: 400 });
  }
  const access = await requireWorkspaceRole(body.workspaceId, ["owner"]);
  if (access.error) return access.error;
  const { memberId } = await context.params;
  return forwardWorkspaceRequest(
    `/v1/workspaces/${access.workspaceId}/members/${encodeURIComponent(memberId)}`,
    access.workspaceId,
    { method: "PATCH", body: JSON.stringify({ role: body.role }) },
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
  } | null;
  const access = await requireWorkspaceRole(body?.workspaceId, ["owner", "admin"]);
  if (access.error) return access.error;
  const { memberId } = await context.params;
  if (!memberId) {
    return NextResponse.json({ message: "A member identifier is required." }, { status: 400 });
  }
  return forwardWorkspaceRequest(
    `/v1/workspaces/${access.workspaceId}/members/${encodeURIComponent(memberId)}`,
    access.workspaceId,
    { method: "DELETE" },
  );
}
