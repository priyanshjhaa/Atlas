import { ImpactNewPage } from "@/components/features/impact";
import {
  getAtlasNotionConnectors,
  getAtlasNotionResources,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, repositories } = await getAtlasWorkspaceData();
  const [notionConnectors, notionResources] = await Promise.all([
    getAtlasNotionConnectors(activeWorkspace.id).catch(() => []),
    getAtlasNotionResources(activeWorkspace.id).catch(() => []),
  ]);
  return (
    <ImpactNewPage
      notionConnectors={notionConnectors}
      notionResources={notionResources}
      repositories={repositories.filter(
        (repository) => repository.isActive && repository.lastSyncedAt,
      )}
      workspace={activeWorkspace}
    />
  );
}
