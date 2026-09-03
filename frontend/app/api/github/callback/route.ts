import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { verifyGitHubAppState } from "@/lib/github-app-state";
import type { GitHubAppReturnTo } from "@/lib/github-app-state";
import { getAtlasMe } from "@/lib/workspace-api";

function sourcesRedirect(
  request: Request,
  returnTo: GitHubAppReturnTo,
  result: "connected" | "cancelled" | "error",
) {
  const target = new URL(
    returnTo === "onboarding" ? "/app/onboarding" : "/app/sources",
    request.url,
  );
  target.searchParams.set("github", result);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const installationId = params.get("installation_id");
  const rawState = params.get("state");
  const state = rawState ? verifyGitHubAppState(rawState) : null;
  if (!state) return sourcesRedirect(request, "sources", "error");
  if (params.get("setup_action") === "request") {
    return sourcesRedirect(request, state.returnTo, "cancelled");
  }
  if (!installationId || !/^\d+$/.test(installationId)) {
    return sourcesRedirect(request, state.returnTo, "error");
  }

  const me = await getAtlasMe();
  const membership = me.workspaces.find(
    (workspace) => workspace.id === state.workspaceId,
  );
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return sourcesRedirect(request, state.returnTo, "error");
  }

  const response = await fetchAtlasApi(
    `/v1/workspaces/${state.workspaceId}/connectors/github/installations`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Atlas-Workspace-Id": state.workspaceId,
      },
      body: JSON.stringify({ installationId }),
    },
  );

  return sourcesRedirect(
    request,
    state.returnTo,
    response.ok ? "connected" : "error",
  );
}
