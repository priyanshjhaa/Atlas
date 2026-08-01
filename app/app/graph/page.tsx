import { GraphPage } from "@/components/features/explore";
import {
  getAtlasGraph,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, repositories } =
    await getAtlasWorkspaceData();
  const repository = repositories.find(
    (item) => item.isActive && item.lastSyncedAt,
  );
  const graph = repository
    ? await getAtlasGraph(activeWorkspace.id, repository.id).catch(() => null)
    : null;
  return (
    <GraphPage
      workspace={activeWorkspace}
      repositories={repositories}
      graph={graph}
    />
  );
}
