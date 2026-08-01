import { SearchPage } from "@/components/features/explore";
import { getAtlasWorkspaceData } from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, repositories } =
    await getAtlasWorkspaceData();
  return (
    <SearchPage
      workspace={activeWorkspace}
      repositories={repositories}
    />
  );
}
