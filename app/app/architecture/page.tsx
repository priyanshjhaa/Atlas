import { GraphPage } from "@/components/features/explore";
import {
  getAtlasArchitecture,
  getAtlasGraph,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, repositories } =
    await getAtlasWorkspaceData();
  const repository = repositories.find(
    (item) => item.isActive && item.lastSyncedAt,
  );
  const [graph, architectureSnapshot] = repository
    ? await Promise.all([
        getAtlasGraph(activeWorkspace.id, repository.id).catch(() => null),
        getAtlasArchitecture(activeWorkspace.id, repository.id).catch(
          () => null,
        ),
      ])
    : [null, null];
  return (
    <GraphPage
      architecture
      workspace={activeWorkspace}
      repositories={repositories}
      graph={graph}
      architectureSnapshot={architectureSnapshot}
    />
  );
}
