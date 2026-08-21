import { GraphPage } from "@/components/features/explore";
import {
  getAtlasGraph,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { activeWorkspace, repositories } =
    await getAtlasWorkspaceData();
  const params = await searchParams;
  const availableRepositories = repositories.filter(
    (item) => item.isActive && item.lastSyncedAt,
  );
  const repository =
    availableRepositories.find((item) => item.id === first(params.repository)) ??
    availableRepositories[0];
  const depthValue = Number(first(params.depth));
  const depth = ([1, 2, 3].includes(depthValue) ? depthValue : 2) as 1 | 2 | 3;
  const directionValue = first(params.direction);
  const direction = (["incoming", "outgoing", "both"] as const).includes(
    directionValue as "incoming" | "outgoing" | "both",
  )
    ? (directionValue as "incoming" | "outgoing" | "both")
    : "both";
  const includeHistorical = first(params.historical) === "true";
  const includeInferred = first(params.inferred) === "true";
  const entityId = first(params.entity);
  const graph = repository
    ? await getAtlasGraph(activeWorkspace.id, repository.id, {
        depth,
        direction,
        includeHistorical,
        includeInferred,
        ...(entityId ? { entityId } : {}),
      }).catch(() => null)
    : null;
  return (
    <GraphPage
      key={`${repository?.id ?? "empty"}:${graph?.rootEntityId ?? "root"}:${depth}:${direction}:${includeHistorical}:${includeInferred}`}
      workspace={activeWorkspace}
      repositories={repositories}
      graph={graph}
      selectedRepositoryId={repository?.id ?? ""}
      traversal={{ depth, direction, includeHistorical, includeInferred }}
    />
  );
}
