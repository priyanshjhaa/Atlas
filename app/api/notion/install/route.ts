import { NextResponse } from "next/server";
import { createNotionOAuthState } from "@/lib/notion-oauth-state";
import { getAtlasMe } from "@/lib/workspace-api";

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  const returnTo =
    new URL(request.url).searchParams.get("returnTo") === "onboarding"
      ? "onboarding"
      : "sources";
  if (!workspaceId) {
    return NextResponse.json(
      { message: "A workspace identifier is required." },
      { status: 400 },
    );
  }

  const me = await getAtlasMe();
  const membership = me.workspaces.find(
    (workspace) => workspace.id === workspaceId,
  );
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { message: "Workspace administrator access is required." },
      { status: 403 },
    );
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { message: "The Notion connector is not configured." },
      { status: 503 },
    );
  }

  const redirectUri =
    process.env.NOTION_REDIRECT_URI ??
    new URL("/api/notion/callback", request.url).toString();
  const target = new URL("https://api.notion.com/v1/oauth/authorize");
  target.searchParams.set("client_id", clientId);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("owner", "user");
  target.searchParams.set("redirect_uri", redirectUri);
  target.searchParams.set(
    "state",
    createNotionOAuthState(workspaceId, returnTo),
  );
  return NextResponse.redirect(target);
}
