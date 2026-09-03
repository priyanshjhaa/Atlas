import { NextResponse } from "next/server";
import { fetchAtlasApi } from "@/lib/backend-client";
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
  const response = await fetchAtlasApi(
    `/v1/workspaces/${workspaceId}/pilot-metrics`,
    {
      cache: "no-store",
      headers: { "X-Atlas-Workspace-Id": workspaceId },
    },
  );
  if (!response.ok) {
    return NextResponse.json(
      { message: "Atlas could not export pilot metrics." },
      { status: response.status },
    );
  }
  const metrics = (await response.json()) as {
    export?: Array<Record<string, string | number | boolean>>;
  };
  const rows = metrics.export ?? [];
  const headers = [
    "reportId",
    "rating",
    "confirmedFindingCount",
    "hasMissedImpact",
    "createdAt",
    "updatedAt",
  ];
  const csv = [
    headers.join(","),
    ...rows.slice(0, 1_000).map((row) =>
      headers
        .map((header) =>
          JSON.stringify(String(row[header] ?? "")),
        )
        .join(","),
    ),
  ].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="atlas-pilot-metrics.csv"',
      "Cache-Control": "no-store",
    },
  });
}
