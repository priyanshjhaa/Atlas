import {
  forwardWorkspaceRequest,
  requireWorkspaceRole,
} from "@/lib/workspace-settings-proxy";

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    workspaceId?: unknown;
  } | null;
  const access = await requireWorkspaceRole(body?.workspaceId, ["owner", "admin"]);
  if (access.error) return access.error;
  return forwardWorkspaceRequest(
    `/v1/workspaces/${access.workspaceId}/pilot-metrics/expired-feedback`,
    access.workspaceId,
    { method: "DELETE" },
  );
}
