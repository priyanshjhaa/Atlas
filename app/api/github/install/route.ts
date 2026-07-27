import { NextResponse } from "next/server";
import { createGitHubAppState } from "@/lib/github-app-state";
import { getAtlasMe } from "@/lib/workspace-api";

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
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

  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) {
    return NextResponse.json(
      { message: "The GitHub App connector is not configured." },
      { status: 503 },
    );
  }

  const state = createGitHubAppState(workspaceId);
  return NextResponse.redirect(
    `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`,
  );
}
