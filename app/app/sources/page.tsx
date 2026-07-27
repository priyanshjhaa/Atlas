import { SourcesPage } from "@/components/features/workspace";
import {
  getAtlasGitHubConnectors,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, repositories } = await getAtlasWorkspaceData();
  const githubConnectors = await getAtlasGitHubConnectors(activeWorkspace.id);
  return (
    <SourcesPage
      githubConnectors={githubConnectors}
      repositories={repositories}
      workspace={activeWorkspace}
    />
  );
}
