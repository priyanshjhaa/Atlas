import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAtlasMe } from "@/lib/workspace-api";

export async function POST(request: Request) {
  const body = (await request.json()) as { workspaceId?: unknown };

  if (typeof body.workspaceId !== "string") {
    return NextResponse.json(
      { message: "A workspace identifier is required." },
      { status: 400 },
    );
  }

  const me = await getAtlasMe();
  const membership = me.workspaces.some(
    (workspace) => workspace.id === body.workspaceId,
  );
  if (!membership) {
    return NextResponse.json(
      { message: "The selected workspace is not available." },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set("atlas-workspace", body.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/app",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ workspaceId: body.workspaceId });
}
