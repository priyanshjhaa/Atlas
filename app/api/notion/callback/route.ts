import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { verifyNotionOAuthState } from "@/lib/notion-oauth-state";
import type { NotionOAuthReturnTo } from "@/lib/notion-oauth-state";
import { getAtlasMe } from "@/lib/workspace-api";

function sourcesRedirect(
  request: Request,
  returnTo: NotionOAuthReturnTo,
  result: "connected" | "cancelled" | "error",
) {
  const target = new URL(
    returnTo === "onboarding" ? "/app/onboarding" : "/app/sources",
    request.url,
  );
  target.searchParams.set("notion", result);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const rawState = params.get("state");
  const state = rawState ? verifyNotionOAuthState(rawState) : null;
  if (!state) return sourcesRedirect(request, "sources", "error");
  if (params.get("error")) {
    return sourcesRedirect(request, state.returnTo, "cancelled");
  }
  if (!code) return sourcesRedirect(request, state.returnTo, "error");

  const me = await getAtlasMe();
  const membership = me.workspaces.find(
    (workspace) => workspace.id === state.workspaceId,
  );
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return sourcesRedirect(request, state.returnTo, "error");
  }

  const response = await fetchAtlasApi(
    `/v1/workspaces/${state.workspaceId}/connectors/notion/oauth`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Atlas-Workspace-Id": state.workspaceId,
      },
      body: JSON.stringify({ code }),
    },
  );
  return sourcesRedirect(
    request,
    state.returnTo,
    response.ok ? "connected" : "error",
  );
}
