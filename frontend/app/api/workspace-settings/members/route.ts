import { NextResponse } from "next/server";
import type { AtlasWorkspaceRole } from "@/lib/api-types";
import {
  forwardWorkspaceRequest,
  requireWorkspaceRole,
} from "@/lib/workspace-settings-proxy";

const assignableRoles: AtlasWorkspaceRole[] = ["admin", "member", "viewer"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
    email?: unknown;
    role?: unknown;
  } | null;
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.role !== "string" ||
    !assignableRoles.includes(body.role as AtlasWorkspaceRole)
  ) {
    return NextResponse.json(
      { message: "Enter a valid member email and role." },
      { status: 400 },
    );
  }
  const access = await requireWorkspaceRole(body.workspaceId, ["owner", "admin"]);
  if (access.error) return access.error;
  return forwardWorkspaceRequest(
    `/v1/workspaces/${access.workspaceId}/members`,
    access.workspaceId,
    {
      method: "POST",
      body: JSON.stringify({ email: body.email.trim(), role: body.role }),
    },
  );
}
