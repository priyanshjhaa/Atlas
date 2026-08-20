import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
import { getAtlasMe } from "@/lib/workspace-api";

const actions = ["briefings", "acknowledge", "questions"] as const;
type Action = (typeof actions)[number];

function isAction(value: string): value is Action {
  return actions.some((action) => action === value);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (!isAction(action)) {
    return NextResponse.json({ message: "Unknown context action." }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body || typeof body.workspaceId !== "string") {
    return NextResponse.json(
      { message: "A workspace is required." },
      { status: 400 },
    );
  }
  const me = await getAtlasMe();
  if (!me.workspaces.some((workspace) => workspace.id === body.workspaceId)) {
    return NextResponse.json(
      { message: "Workspace member access is required." },
      { status: 403 },
    );
  }

  let payload: Record<string, string>;
  if (action === "briefings") {
    if (
      typeof body.snapshotFrom !== "string" ||
      typeof body.snapshotThrough !== "string"
    ) {
      return NextResponse.json(
        { message: "The catch-up snapshot range is required." },
        { status: 400 },
      );
    }
    payload = {
      snapshotFrom: body.snapshotFrom,
      snapshotThrough: body.snapshotThrough,
    };
  } else if (action === "acknowledge") {
    if (typeof body.acknowledgedThrough !== "string") {
      return NextResponse.json(
        { message: "A snapshot acknowledgement is required." },
        { status: 400 },
      );
    }
    payload = { acknowledgedThrough: body.acknowledgedThrough };
  } else {
    if (
      typeof body.query !== "string" ||
      body.query.trim().length < 2 ||
      body.query.length > 500
    ) {
      return NextResponse.json(
        { message: "Ask a question between 2 and 500 characters." },
        { status: 400 },
      );
    }
    payload = { query: body.query.trim() };
  }

  const response = await fetchAtlasApi(
    `/v1/workspaces/${body.workspaceId}/notion-context/${action}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Atlas-Workspace-Id": body.workspaceId,
      },
      body: JSON.stringify(payload),
    },
  );
  const responseBody = await response.json().catch(() => ({
    message: "The Notion context service returned an invalid response.",
  }));
  return NextResponse.json(responseBody, { status: response.status });
}
