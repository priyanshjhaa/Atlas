import { SourcesPage } from "@/components/features/workspace";
import { getAtlasWorkspaceData } from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, repositories } = await getAtlasWorkspaceData();
  return (
    <SourcesPage
      repositories={repositories}
      workspace={activeWorkspace}
    />
  );
}
