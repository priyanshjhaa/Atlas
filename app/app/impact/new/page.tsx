import { ImpactNewPage } from "@/components/features/impact";
import { getAtlasWorkspaceData } from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, repositories } = await getAtlasWorkspaceData();
  return (
    <ImpactNewPage
      repositories={repositories.filter(
        (repository) => repository.isActive && repository.lastSyncedAt,
      )}
      workspace={activeWorkspace}
    />
  );
}
